import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

from services.agent_service import AgentRequest, AgentService


class AgentServiceTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        root = Path(self.temp_dir.name)
        self.project_root = root / "repo"
        self.model_root = self.project_root / "models"
        self.project_root.mkdir()
        self.calls = []

    def tearDown(self):
        self.temp_dir.cleanup()

    def command_runner(self, command, prompt, timeout, cwd, env, cancel_event):
        self.calls.append((command, prompt, timeout, cwd, env, cancel_event))
        return "agent output"

    def test_codex_cli_is_read_only_uses_repo_workspace_and_repo_models(self):
        service = AgentService(
            project_root=self.project_root,
            model_root=self.model_root,
            command_runner=self.command_runner,
        )
        with patch("services.agent_service._resolve_command", return_value=["codex"]):
            result = service.run(AgentRequest(prompt="inspect", provider="codex_cli"))

        command, prompt, _, cwd, env, _ = self.calls[0]
        self.assertEqual(prompt, "inspect")
        self.assertEqual(cwd, self.project_root.resolve())
        self.assertIn("read-only", command)
        self.assertNotIn("--ignore-rules", command)
        self.assertEqual(Path(env["OLLAMA_MODELS"]), self.model_root / "ollama")
        self.assertEqual(Path(env["HF_HOME"]), self.model_root / "huggingface")
        self.assertEqual(result.capability, "workspace_read_only")

    def test_claude_is_prompt_only_with_tools_disabled(self):
        service = AgentService(
            project_root=self.project_root,
            model_root=self.model_root,
            command_runner=self.command_runner,
        )
        with patch("services.agent_service._resolve_command", return_value=["claude"]):
            result = service.run(AgentRequest(prompt="answer", provider="claude_cli"))

        command = self.calls[0][0]
        self.assertEqual(command[command.index("--tools") + 1], "")
        self.assertIn("--safe-mode", command)
        self.assertIn("--no-session-persistence", command)
        self.assertEqual(result.capability, "prompt_only")

    def test_codex_sdk_receives_read_only_workspace_environment(self):
        calls = []

        def sdk_runner(prompt, model, timeout, runtime_dir, env, cancel_event):
            calls.append((prompt, model, timeout, runtime_dir, env, cancel_event))
            return "sdk output"

        service = AgentService(
            project_root=self.project_root,
            model_root=self.model_root,
            sdk_runner=sdk_runner,
        )
        result = service.run(AgentRequest(prompt="inspect", provider="codex_sdk"), threading.Event())

        self.assertEqual(calls[0][3], self.project_root.resolve())
        self.assertEqual(Path(calls[0][4]["TORCH_HOME"]), self.model_root / "torch")
        self.assertEqual(result.output, "sdk output")

    def test_empty_and_unsupported_requests_are_rejected(self):
        service = AgentService(project_root=self.project_root, model_root=self.model_root)
        with self.assertRaises(ValueError):
            service.run(AgentRequest(prompt=" "))
        with self.assertRaises(ValueError):
            service.run(AgentRequest(prompt="test", provider="openai_compatible"))


if __name__ == "__main__":
    unittest.main()
