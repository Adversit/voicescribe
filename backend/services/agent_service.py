import os
import threading
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Callable, Optional

from services.text_processing_service import (
    TextProcessingCancelled,
    _default_command_runner,
    _default_sdk_runner,
    _resolve_command,
)


SUPPORTED_AGENT_PROVIDERS = ("claude_cli", "codex_cli", "codex_sdk")
CLAUDE_AGENT_SYSTEM_PROMPT = (
    "You are a non-interactive, prompt-only assistant. "
    "Do not inspect files, use tools, modify anything, or request permission. "
    "Answer the user's prompt directly."
)

CommandRunner = Callable[[list[str], str, int, Path, dict[str, str], Optional[threading.Event]], str]


class AgentCancelled(Exception):
    pass


@dataclass(frozen=True)
class AgentRequest:
    prompt: str
    provider: str = "codex_cli"
    model: str = ""
    timeout_seconds: int = 120


@dataclass(frozen=True)
class AgentResult:
    output: str
    provider: str
    model: Optional[str]
    workspace: str
    capability: str
    duration_ms: int

    def to_dict(self) -> dict:
        return asdict(self)


class AgentService:
    def __init__(
        self,
        *,
        project_root: Path,
        model_root: Path,
        command_runner: Optional[CommandRunner] = None,
        sdk_runner: Optional[Callable[..., str]] = None,
    ) -> None:
        self.project_root = project_root.resolve()
        self.model_root = model_root.resolve()
        self.command_runner = command_runner or _default_command_runner
        self.sdk_runner = sdk_runner or _default_sdk_runner

    def _provider_env(self) -> dict[str, str]:
        env = os.environ.copy()
        paths = {
            "OLLAMA_MODELS": self.model_root / "ollama",
            "HF_HOME": self.model_root / "huggingface",
            "HUGGINGFACE_HUB_CACHE": self.model_root / "huggingface" / "hub",
            "TRANSFORMERS_CACHE": self.model_root / "huggingface" / "transformers",
            "TORCH_HOME": self.model_root / "torch",
            "MODELSCOPE_CACHE": self.model_root,
        }
        for name, path in paths.items():
            path.mkdir(parents=True, exist_ok=True)
            env[name] = str(path)
        return env

    def _run_claude(
        self,
        prompt: str,
        model: str,
        timeout_seconds: int,
        cancel_event: Optional[threading.Event],
    ) -> str:
        command = _resolve_command("claude")
        command.extend(
            [
                "--print",
                "--output-format",
                "text",
                "--no-session-persistence",
                "--safe-mode",
                "--disable-slash-commands",
                "--tools",
                "",
                "--system-prompt",
                CLAUDE_AGENT_SYSTEM_PROMPT,
            ]
        )
        if model:
            command.extend(["--model", model])
        return self.command_runner(
            command,
            prompt,
            timeout_seconds,
            self.project_root,
            self._provider_env(),
            cancel_event,
        )

    def _run_codex_cli(
        self,
        prompt: str,
        model: str,
        timeout_seconds: int,
        cancel_event: Optional[threading.Event],
    ) -> str:
        command = _resolve_command("codex")
        command.extend(["exec", "--ephemeral", "--sandbox", "read-only", "--skip-git-repo-check"])
        if model:
            command.extend(["--model", model])
        command.append("-")
        return self.command_runner(
            command,
            prompt,
            timeout_seconds,
            self.project_root,
            self._provider_env(),
            cancel_event,
        )

    def run(self, request: AgentRequest, cancel_event: Optional[threading.Event] = None) -> AgentResult:
        prompt = request.prompt.strip()
        if not prompt:
            raise ValueError("Agent prompt must not be empty")
        if len(prompt) > 20000:
            raise ValueError("Agent prompt must not exceed 20000 characters")
        if request.provider not in SUPPORTED_AGENT_PROVIDERS:
            raise ValueError(f"Unsupported agent provider: {request.provider}")

        timeout_seconds = max(5, min(request.timeout_seconds, 600))
        started = time.perf_counter()
        try:
            if request.provider == "claude_cli":
                output = self._run_claude(prompt, request.model, timeout_seconds, cancel_event)
                capability = "prompt_only"
            elif request.provider == "codex_cli":
                output = self._run_codex_cli(prompt, request.model, timeout_seconds, cancel_event)
                capability = "workspace_read_only"
            else:
                output = self.sdk_runner(
                    prompt,
                    request.model,
                    timeout_seconds,
                    self.project_root,
                    self._provider_env(),
                    cancel_event,
                )
                capability = "workspace_read_only"
        except TextProcessingCancelled as error:
            raise AgentCancelled("Agent task was cancelled") from error

        duration_ms = int((time.perf_counter() - started) * 1000)
        output = output.strip()
        if not output:
            raise RuntimeError("Agent provider returned empty output")
        print(
            f"[Agent] status=completed provider={request.provider} model={request.model or '(default)'} "
            f"duration_ms={duration_ms} prompt_chars={len(prompt)} output_chars={len(output)}"
        )
        return AgentResult(
            output=output,
            provider=request.provider,
            model=request.model or None,
            workspace=str(self.project_root),
            capability=capability,
            duration_ms=duration_ms,
        )
