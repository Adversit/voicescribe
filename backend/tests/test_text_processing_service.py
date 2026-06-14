import sys
import tempfile
import threading
import time
import types
import unittest
from pathlib import Path
from unittest.mock import patch

from services.text_processing_service import (
    TextProcessingRequest,
    TextProcessingCancelled,
    TextProcessingService,
    _default_command_runner,
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

        def runner(command, prompt, timeout, cwd, env, cancel_event):
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

    def test_target_app_kind_adds_minimal_style_hint(self):
        captured = {}

        def runner(command, prompt, timeout, cwd, env, cancel_event):
            captured["prompt"] = prompt
            return "Polished result"

        service = self.make_service(command_runner=runner)
        with patch("services.text_processing_service._resolve_command", return_value=["claude.exe"]):
            result = service.process(
                TextProcessingRequest(
                    text="explain the command",
                    profile="light",
                    provider="claude_cli",
                    target_context={
                        "app_kind": "terminal",
                        "executable_name": "pwsh.exe",
                        "captured_at": "2026-06-13T12:00:00Z",
                    },
                )
            )

        self.assertIn("The target is a terminal", captured["prompt"])
        self.assertNotIn("pwsh.exe", captured["prompt"])
        self.assertEqual(result.target_context["app_kind"], "terminal")

    def test_custom_style_is_bounded_and_identified_without_persisting_instructions(self):
        captured = {}

        def runner(command, prompt, timeout, cwd, env, cancel_event):
            captured["prompt"] = prompt
            return "Polished result"

        service = self.make_service(command_runner=runner)
        with patch("services.text_processing_service._resolve_command", return_value=["claude.exe"]):
            result = service.process(
                TextProcessingRequest(
                    text="raw words",
                    profile="light",
                    style_profile={
                        "id": " concise ",
                        "name": " Concise ",
                        "instructions": "Use <short> sentences." + ("x" * 3000),
                    },
                )
            )

        self.assertIn("<style_instructions>\nUse short sentences.", captured["prompt"])
        self.assertNotIn("<short>", captured["prompt"])
        self.assertLessEqual(len(captured["prompt"].split("<style_instructions>\n", 1)[1].split("\n</style_instructions>", 1)[0]), 2000)
        self.assertEqual(result.style_profile_id, "concise")
        self.assertEqual(result.style_profile_name, "Concise")
        self.assertNotIn("instructions", result.to_dict())

    def test_raw_profile_ignores_custom_style(self):
        service = self.make_service()
        result = service.process(
            TextProcessingRequest(
                text="raw words",
                profile="raw",
                style_profile={"id": "short", "name": "Short", "instructions": "Keep it short."},
            )
        )

        self.assertIsNone(result.style_profile_id)
        self.assertIsNone(result.style_profile_name)

    def test_raw_profile_keeps_context_without_calling_provider(self):
        calls = []
        service = self.make_service(command_runner=lambda *args: calls.append(args))

        result = service.process(
            TextProcessingRequest(text="raw words", profile="raw", target_context={"app_kind": "chat"})
        )

        self.assertEqual(result.target_context["app_kind"], "chat")
        self.assertEqual(calls, [])

    def test_unknown_context_kind_is_normalized_and_not_added_to_prompt(self):
        captured = {}

        def runner(command, prompt, timeout, cwd, env, cancel_event):
            captured["prompt"] = prompt
            return "Polished result"

        service = self.make_service(command_runner=runner)
        with patch("services.text_processing_service._resolve_command", return_value=["claude.exe"]):
            result = service.process(
                TextProcessingRequest(
                    text="spoken",
                    profile="light",
                    provider="claude_cli",
                    target_context={"app_kind": "private-app-kind", "executable_name": "x" * 500},
                )
            )

        self.assertEqual(result.target_context["app_kind"], "unknown")
        self.assertEqual(len(result.target_context["executable_name"]), 120)
        self.assertNotIn("Target application style hint", captured["prompt"])

    def test_codex_cli_uses_ephemeral_read_only_mode(self):
        captured = {}

        def runner(command, prompt, timeout, cwd, env, cancel_event):
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

        def sdk_runner(prompt, model, timeout, cancel_event):
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

    def test_default_command_runner_terminates_process_on_cancel(self):
        cancel_event = threading.Event()
        outcome = {}

        def run():
            try:
                _default_command_runner(
                    [sys.executable, "-c", "import sys,time; sys.stdin.read(); time.sleep(30)"],
                    "prompt",
                    60,
                    Path(tempfile.gettempdir()),
                    {},
                    cancel_event,
                )
            except Exception as error:
                outcome["error"] = error

        worker = threading.Thread(target=run)
        worker.start()
        time.sleep(0.2)
        cancel_event.set()
        worker.join(timeout=5)

        self.assertFalse(worker.is_alive())
        self.assertIsInstance(outcome.get("error"), TextProcessingCancelled)

    def test_default_command_runner_drains_large_output(self):
        output = _default_command_runner(
            [sys.executable, "-c", "import sys; sys.stdin.read(); sys.stdout.write('x' * 200000)"],
            "prompt",
            10,
            Path(tempfile.gettempdir()),
            {},
        )

        self.assertEqual(len(output), 200000)

    def test_codex_sdk_runner_interrupts_on_cancel(self):
        cancel_event = threading.Event()
        interrupted = threading.Event()

        class FakeTurn:
            def run(self):
                interrupted.wait(5)
                return types.SimpleNamespace(final_response="too late")

            def interrupt(self):
                interrupted.set()

        class FakeThread:
            def turn(self, prompt):
                return FakeTurn()

        class FakeCodex:
            def __init__(self, config=None):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return None

            def thread_start(self, **options):
                return FakeThread()

        class FakeCodexConfig:
            def __init__(self, **options):
                pass

        fake_module = types.SimpleNamespace(
            ApprovalMode=types.SimpleNamespace(deny_all="deny-all"),
            Codex=FakeCodex,
            CodexConfig=FakeCodexConfig,
            Sandbox=types.SimpleNamespace(read_only="read-only"),
        )
        cancel_event.set()
        with patch.dict("sys.modules", {"openai_codex": fake_module}):
            with self.assertRaises(TextProcessingCancelled):
                _default_sdk_runner("prompt", "", 30, cancel_event=cancel_event)

        self.assertTrue(interrupted.is_set())

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

    def test_cli_probe_checks_command_without_launching_provider(self):
        calls = []
        service = self.make_service(command_runner=lambda *args: calls.append(args))

        with patch("services.text_processing_service._resolve_command", return_value=["claude.exe"]):
            result = service.probe_provider("claude_cli")

        self.assertEqual(result.status, "ready")
        self.assertEqual(calls, [])
        self.assertNotIn("claude.exe", result.detail)

    def test_codex_sdk_probe_checks_import_without_starting_session(self):
        service = self.make_service()
        with patch("services.text_processing_service.importlib.util.find_spec", return_value=object()):
            result = service.probe_provider("codex_sdk")

        self.assertEqual(result.status, "ready")

    def test_openai_compatible_probe_verifies_configured_model(self):
        captured = {}

        def getter(url, timeout):
            captured.update(url=url, timeout=timeout)
            return {"data": [{"id": "qwen3:8b"}]}

        service = self.make_service(http_getter=getter)
        result = service.probe_provider(
            "openai_compatible",
            model="qwen3:8b",
            base_url="http://127.0.0.1:11434/v1",
        )

        self.assertEqual(result.status, "ready")
        self.assertEqual(captured["url"], "http://127.0.0.1:11434/v1/models")

    def test_openai_compatible_probe_distinguishes_unconfigured_and_missing_model(self):
        service = self.make_service(http_getter=lambda *_: {"data": [{"id": "qwen3:8b"}]})

        unconfigured = service.probe_provider("openai_compatible", model="")
        missing = service.probe_provider("openai_compatible", model="missing:latest")

        self.assertEqual(unconfigured.status, "unconfigured")
        self.assertEqual(missing.status, "unavailable")

    def test_invalid_profile_falls_back(self):
        service = self.make_service()
        result = service.process(TextProcessingRequest(text="keep me", profile="unknown"))

        self.assertEqual(result.status, "fallback")
        self.assertEqual(result.text, "keep me")
        self.assertIn("Unsupported text processing profile", result.warning)


if __name__ == "__main__":
    unittest.main()
