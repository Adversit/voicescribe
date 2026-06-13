import tempfile
import threading
import types
import unittest
from pathlib import Path
from unittest.mock import patch

from services.text_processing_service import (
    TextProcessingRequest,
    TextProcessingService,
    _default_sdk_runner,
)


class TextProcessingServiceTests(unittest.TestCase):
    def make_service(self, **overrides):
        temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(temp_dir.cleanup)
        root = Path(temp_dir.name)
        return TextProcessingService(
            model_root=root / "models",
            runtime_dir=root / "runtime",
            **overrides,
        )

    def test_raw_profile_skips_provider(self):
        calls = []
        service = self.make_service(command_runner=lambda *args: calls.append(args))

        result = service.process(TextProcessingRequest(text="raw words", profile="raw"))

        self.assertEqual(result.status, "skipped")
        self.assertEqual(result.raw_text, "raw words")
        self.assertEqual(result.text, "raw words")
        self.assertEqual(calls, [])

    def test_claude_cli_receives_transcription_through_stdin_not_argv(self):
        captured = {}

        def runner(command, prompt, timeout, cwd, env):
            captured.update(command=command, prompt=prompt, timeout=timeout, cwd=cwd, env=env)
            return "Polished result"

        service = self.make_service(command_runner=runner)
        with patch("services.text_processing_service._resolve_command", return_value=["claude.exe"]):
            result = service.process(
                TextProcessingRequest(
                    text="secret spoken text",
                    profile="light",
                    provider="claude_cli",
                    model="sonnet",
                )
            )

        self.assertEqual(result.status, "processed")
        self.assertEqual(result.text, "Polished result")
        self.assertNotIn("secret spoken text", " ".join(captured["command"]))
        self.assertIn("<transcription>\nsecret spoken text\n</transcription>", captured["prompt"])
        self.assertIn("--safe-mode", captured["command"])
        self.assertIn("--system-prompt", captured["command"])
        self.assertEqual(captured["env"]["OLLAMA_MODELS"], str(service.model_root / "ollama"))

    def test_codex_cli_uses_ephemeral_read_only_mode(self):
        captured = {}

        def runner(command, prompt, timeout, cwd, env):
            captured["command"] = command
            return "Structured result"

        service = self.make_service(command_runner=runner)
        with patch("services.text_processing_service._resolve_command", return_value=["codex.exe"]):
            result = service.process(
                TextProcessingRequest(
                    text="make a clear prompt",
                    profile="structured",
                    provider="codex_cli",
                )
            )

        self.assertEqual(result.status, "processed")
        self.assertIn("--ephemeral", captured["command"])
        self.assertIn("read-only", captured["command"])
        self.assertEqual(captured["command"][-1], "-")

    def test_codex_sdk_adapter_is_used(self):
        captured = {}

        def sdk_runner(prompt, model, timeout):
            captured.update(prompt=prompt, model=model, timeout=timeout)
            return "SDK result"

        service = self.make_service(sdk_runner=sdk_runner)
        result = service.process(
            TextProcessingRequest(
                text="spoken",
                profile="formal",
                provider="codex_sdk",
                model="gpt-5.4",
            )
        )

        self.assertEqual(result.text, "SDK result")
        self.assertEqual(captured["model"], "gpt-5.4")

    def test_default_codex_sdk_runner_interrupts_on_timeout(self):
        interrupted = threading.Event()
        captured = {}

        class FakeTurn:
            def run(self):
                interrupted.wait(5)
                return types.SimpleNamespace(final_response="too late")

            def interrupt(self):
                interrupted.set()

        class FakeThread:
            def turn(self, prompt):
                self.prompt = prompt
                return FakeTurn()

        class FakeCodex:
            def __init__(self, config=None):
                captured["config"] = config

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return None

            def thread_start(self, **options):
                captured["thread_options"] = options
                return FakeThread()

        class FakeCodexConfig:
            def __init__(self, **options):
                self.options = options

        fake_module = types.SimpleNamespace(
            ApprovalMode=types.SimpleNamespace(deny_all="deny-all"),
            Codex=FakeCodex,
            CodexConfig=FakeCodexConfig,
            Sandbox=types.SimpleNamespace(read_only="read-only"),
        )
        with patch.dict("sys.modules", {"openai_codex": fake_module}):
            with self.assertRaisesRegex(TimeoutError, "timed out after 1 seconds"):
                _default_sdk_runner("prompt", "", 1)

        self.assertTrue(interrupted.is_set())
        self.assertTrue(captured["thread_options"]["ephemeral"])
        self.assertEqual(captured["thread_options"]["approval_mode"], "deny-all")

    def test_openai_compatible_adapter_uses_chat_completions(self):
        captured = {}

        def http_sender(url, payload, timeout):
            captured.update(url=url, payload=payload, timeout=timeout)
            return {"choices": [{"message": {"content": "Local result"}}]}

        service = self.make_service(http_sender=http_sender)
        result = service.process(
            TextProcessingRequest(
                text="spoken",
                profile="light",
                provider="openai_compatible",
                model="qwen3:8b",
                base_url="http://127.0.0.1:11434/v1",
            )
        )

        self.assertEqual(result.text, "Local result")
        self.assertEqual(captured["url"], "http://127.0.0.1:11434/v1/chat/completions")
        self.assertEqual(captured["payload"]["model"], "qwen3:8b")

    def test_provider_failure_falls_back_to_original(self):
        def runner(*args):
            raise TimeoutError("provider timed out")

        service = self.make_service(command_runner=runner)
        with patch("services.text_processing_service._resolve_command", return_value=["claude.exe"]):
            result = service.process(
                TextProcessingRequest(text="keep me", profile="light", provider="claude_cli")
            )

        self.assertEqual(result.status, "fallback")
        self.assertEqual(result.raw_text, "keep me")
        self.assertEqual(result.text, "keep me")
        self.assertIn("provider timed out", result.warning)

    def test_invalid_profile_falls_back(self):
        service = self.make_service()
        result = service.process(TextProcessingRequest(text="keep me", profile="unknown"))

        self.assertEqual(result.status, "fallback")
        self.assertEqual(result.text, "keep me")
        self.assertIn("Unsupported text processing profile", result.warning)


if __name__ == "__main__":
    unittest.main()
