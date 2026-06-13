import json
import os
import shutil
import subprocess
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Callable, Optional
from urllib.parse import urlparse

from postprocess.text_processing_prompts import (
    SUPPORTED_PROFILES,
    build_processing_prompt,
    build_summary_prompt,
)


SUPPORTED_PROVIDERS = ("claude_cli", "codex_cli", "codex_sdk", "openai_compatible")
DEFAULT_OPENAI_COMPATIBLE_URL = "http://127.0.0.1:11434/v1"
CLAUDE_CLI_SYSTEM_PROMPT = (
    "You are a non-interactive voice-to-text cleanup engine. "
    "Follow the supplied cleanup rules and output only the transformed text. "
    "Do not inspect or discuss the current directory, repository, tools, or session context."
)

CommandRunner = Callable[[list[str], str, int, Path, dict[str, str]], str]
HttpSender = Callable[[str, dict, int], dict]
SdkRunner = Callable[[str, str, int], str]


@dataclass(frozen=True)
class TextProcessingRequest:
    text: str
    profile: str = "raw"
    provider: str = "claude_cli"
    model: str = ""
    base_url: str = ""
    target_language: str = ""
    hotwords: tuple[str, ...] = ()
    timeout_seconds: int = 30


@dataclass(frozen=True)
class TextProcessingResult:
    raw_text: str
    text: str
    profile: str
    provider: Optional[str]
    model: Optional[str]
    status: str
    duration_ms: int
    warning: Optional[str] = None

    def to_dict(self) -> dict:
        return asdict(self)


def _short_error(error: Exception) -> str:
    message = " ".join(str(error).split())
    return message[:400] or error.__class__.__name__


def _resolve_command(name: str) -> list[str]:
    resolved = shutil.which(name)
    if not resolved:
        raise RuntimeError(f"{name} CLI was not found on PATH")

    suffix = Path(resolved).suffix.lower()
    if suffix == ".ps1":
        powershell = shutil.which("powershell") or shutil.which("pwsh")
        if not powershell:
            raise RuntimeError(f"PowerShell is required to run {resolved}")
        return [
            powershell,
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            resolved,
        ]
    if suffix in {".cmd", ".bat"}:
        command_shell = os.environ.get("COMSPEC") or shutil.which("cmd.exe")
        if not command_shell:
            raise RuntimeError(f"cmd.exe is required to run {resolved}")
        return [command_shell, "/d", "/s", "/c", resolved]
    return [resolved]


def _default_command_runner(
    command: list[str],
    prompt: str,
    timeout_seconds: int,
    cwd: Path,
    env: dict[str, str],
) -> str:
    creation_flags = getattr(subprocess, "CREATE_NO_WINDOW", 0) if os.name == "nt" else 0
    result = subprocess.run(
        command,
        input=prompt,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout_seconds,
        cwd=str(cwd),
        env=env,
        creationflags=creation_flags,
        check=False,
    )
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or f"exit code {result.returncode}"
        raise RuntimeError(detail)
    output = result.stdout.strip()
    if not output:
        raise RuntimeError("provider returned empty text")
    return output


def _default_http_sender(url: str, payload: dict, timeout_seconds: int) -> dict:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
        return json.loads(response.read().decode("utf-8"))


def _default_sdk_runner(
    prompt: str,
    model: str,
    timeout_seconds: int,
    runtime_dir: Optional[Path] = None,
    env: Optional[dict[str, str]] = None,
) -> str:
    try:
        from openai_codex import ApprovalMode, Codex, CodexConfig, Sandbox
    except ImportError as error:
        raise RuntimeError("Codex Python SDK is not installed; install openai-codex") from error

    thread_options = {
        "approval_mode": ApprovalMode.deny_all,
        "ephemeral": True,
        "sandbox": Sandbox.read_only,
    }
    if model:
        thread_options["model"] = model
    config = CodexConfig(
        cwd=str(runtime_dir) if runtime_dir else None,
        env=env,
    )
    with Codex(config=config) as codex:
        thread = codex.thread_start(**thread_options)
        turn = thread.turn(prompt)
        executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="voicescribe-codex-sdk")
        future = executor.submit(turn.run)
        try:
            result = future.result(timeout=timeout_seconds)
        except FutureTimeoutError as error:
            try:
                turn.interrupt()
            finally:
                executor.shutdown(wait=False, cancel_futures=True)
            raise TimeoutError(f"Codex SDK timed out after {timeout_seconds} seconds") from error
        else:
            executor.shutdown(wait=True)
    output = (result.final_response or "").strip()
    if not output:
        raise RuntimeError("Codex SDK returned empty text")
    return output


class TextProcessingService:
    def __init__(
        self,
        *,
        model_root: Path,
        runtime_dir: Path,
        command_runner: Optional[CommandRunner] = None,
        http_sender: Optional[HttpSender] = None,
        sdk_runner: Optional[SdkRunner] = None,
    ) -> None:
        self.model_root = model_root.resolve()
        self.runtime_dir = runtime_dir.resolve()
        self.runtime_dir.mkdir(parents=True, exist_ok=True)
        self.command_runner = command_runner or _default_command_runner
        self.http_sender = http_sender or _default_http_sender
        self.sdk_runner = sdk_runner or (
            lambda prompt, model, timeout: _default_sdk_runner(
                prompt,
                model,
                timeout,
                self.runtime_dir,
                self._provider_env(),
            )
        )

    def _provider_env(self) -> dict[str, str]:
        env = os.environ.copy()
        ollama_models = self.model_root / "ollama"
        ollama_models.mkdir(parents=True, exist_ok=True)
        env["OLLAMA_MODELS"] = str(ollama_models)
        env["HF_HOME"] = str(self.model_root / "huggingface")
        env["HUGGINGFACE_HUB_CACHE"] = str(self.model_root / "huggingface" / "hub")
        env["TRANSFORMERS_CACHE"] = str(self.model_root / "huggingface" / "transformers")
        env["TORCH_HOME"] = str(self.model_root / "torch")
        env["MODELSCOPE_CACHE"] = str(self.model_root)
        return env

    def _run_claude_cli(self, prompt: str, model: str, timeout_seconds: int) -> str:
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
                CLAUDE_CLI_SYSTEM_PROMPT,
            ]
        )
        if model:
            command.extend(["--model", model])
        return self.command_runner(command, prompt, timeout_seconds, self.runtime_dir, self._provider_env())

    def _run_codex_cli(self, prompt: str, model: str, timeout_seconds: int) -> str:
        command = _resolve_command("codex")
        command.extend(
            [
                "exec",
                "--ephemeral",
                "--sandbox",
                "read-only",
                "--skip-git-repo-check",
                "--ignore-rules",
            ]
        )
        if model:
            command.extend(["--model", model])
        command.append("-")
        return self.command_runner(command, prompt, timeout_seconds, self.runtime_dir, self._provider_env())

    def _run_openai_compatible(
        self,
        prompt: str,
        model: str,
        base_url: str,
        timeout_seconds: int,
    ) -> str:
        if not model.strip():
            raise RuntimeError("OpenAI-compatible provider requires a model")
        endpoint = (base_url or DEFAULT_OPENAI_COMPATIBLE_URL).rstrip("/")
        parsed = urlparse(endpoint)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise RuntimeError("OpenAI-compatible base URL must be an HTTP(S) URL")
        if not endpoint.endswith("/chat/completions"):
            endpoint += "/chat/completions"
        response = self.http_sender(
            endpoint,
            {
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.2,
                "stream": False,
            },
            timeout_seconds,
        )
        try:
            output = response["choices"][0]["message"]["content"].strip()
        except (KeyError, IndexError, TypeError, AttributeError) as error:
            raise RuntimeError("OpenAI-compatible provider returned an invalid response") from error
        if not output:
            raise RuntimeError("OpenAI-compatible provider returned empty text")
        return output

    def _dispatch(self, request: TextProcessingRequest, prompt: str) -> str:
        timeout_seconds = max(1, min(request.timeout_seconds, 300))
        if request.provider == "claude_cli":
            return self._run_claude_cli(prompt, request.model, timeout_seconds)
        if request.provider == "codex_cli":
            return self._run_codex_cli(prompt, request.model, timeout_seconds)
        if request.provider == "codex_sdk":
            return self.sdk_runner(prompt, request.model, timeout_seconds)
        if request.provider == "openai_compatible":
            return self._run_openai_compatible(
                prompt,
                request.model,
                request.base_url,
                timeout_seconds,
            )
        raise RuntimeError(f"Unsupported text processing provider: {request.provider}")

    def process(self, request: TextProcessingRequest) -> TextProcessingResult:
        raw_text = request.text.strip()
        started = time.perf_counter()
        if not raw_text or request.profile == "raw":
            return TextProcessingResult(
                raw_text=raw_text,
                text=raw_text,
                profile="raw" if request.profile == "raw" else request.profile,
                provider=None,
                model=None,
                status="skipped",
                duration_ms=0,
            )

        if request.profile not in SUPPORTED_PROFILES:
            warning = f"Unsupported text processing profile: {request.profile}"
            return TextProcessingResult(
                raw_text=raw_text,
                text=raw_text,
                profile=request.profile,
                provider=request.provider,
                model=request.model or None,
                status="fallback",
                duration_ms=0,
                warning=warning,
            )

        try:
            prompt = build_processing_prompt(
                raw_text,
                request.profile,
                request.hotwords,
                request.target_language,
            )
            output = self._dispatch(request, prompt).strip()
            duration_ms = int((time.perf_counter() - started) * 1000)
            print(
                f"[TextProcessing] status=processed profile={request.profile} "
                f"provider={request.provider} model={request.model or '(default)'} "
                f"duration_ms={duration_ms} raw_chars={len(raw_text)} output_chars={len(output)}"
            )
            return TextProcessingResult(
                raw_text=raw_text,
                text=output,
                profile=request.profile,
                provider=request.provider,
                model=request.model or None,
                status="processed",
                duration_ms=duration_ms,
            )
        except Exception as error:
            duration_ms = int((time.perf_counter() - started) * 1000)
            warning = f"Text processing failed; original transcription was kept: {_short_error(error)}"
            print(
                f"[TextProcessing] status=fallback profile={request.profile} "
                f"provider={request.provider} duration_ms={duration_ms} error={_short_error(error)}"
            )
            return TextProcessingResult(
                raw_text=raw_text,
                text=raw_text,
                profile=request.profile,
                provider=request.provider,
                model=request.model or None,
                status="fallback",
                duration_ms=duration_ms,
                warning=warning,
            )

    def summarize(
        self,
        text: str,
        *,
        provider: str = "claude_cli",
        model: str = "",
        base_url: str = "",
        timeout_seconds: int = 10,
    ) -> TextProcessingResult:
        raw_text = text.strip()
        if not raw_text:
            return TextProcessingResult("", "", "summary", None, None, "skipped", 0)
        request = TextProcessingRequest(
            text=raw_text,
            profile="light",
            provider=provider,
            model=model,
            base_url=base_url,
            timeout_seconds=timeout_seconds,
        )
        started = time.perf_counter()
        try:
            output = self._dispatch(request, build_summary_prompt(raw_text)).strip()
            return TextProcessingResult(
                raw_text,
                output,
                "summary",
                provider,
                model or None,
                "processed",
                int((time.perf_counter() - started) * 1000),
            )
        except Exception as error:
            return TextProcessingResult(
                raw_text,
                raw_text,
                "summary",
                provider,
                model or None,
                "fallback",
                int((time.perf_counter() - started) * 1000),
                f"Summary failed: {_short_error(error)}",
            )
