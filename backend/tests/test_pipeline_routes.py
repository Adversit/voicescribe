import asyncio
import io
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException, UploadFile

import server
from services.text_processing_service import TextProcessingResult
from services.text_processing_service import ProviderReadiness


class PipelineRouteTests(unittest.TestCase):
    @staticmethod
    def raw_result(profile="raw", status="skipped"):
        return TextProcessingResult(
            raw_text="raw transcript",
            text="raw transcript",
            profile=profile,
            provider=None,
            model=None,
            status=status,
            duration_ms=0,
            target_context={"app_kind": "chat", "executable_name": None, "captured_at": ""},
        )

    def test_text_process_endpoint_uses_independent_contract(self):
        processed = TextProcessingResult(
            raw_text="raw transcript",
            text="Polished transcript.",
            profile="light",
            provider="claude_cli",
            model=None,
            status="processed",
            duration_ms=12,
            target_context={"app_kind": "chat", "executable_name": None, "captured_at": ""},
        )
        with patch.object(server.text_processing_service, "process", return_value=processed) as process:
            response = asyncio.run(
                server.process_text(
                    server.TextProcessPayload(
                        text="raw transcript",
                        profile="light",
                        provider="claude_cli",
                        hotwords="VoiceScribe, Typeless",
                        target_context={"app_kind": "chat"},
                        style_profile={"id": "short", "name": "Short", "instructions": "Keep it short."},
                    )
                )
            )

        self.assertEqual(response["text"], "Polished transcript.")
        request = process.call_args.args[0]
        self.assertEqual(request.profile, "light")
        self.assertEqual(request.hotwords, ("VoiceScribe", "Typeless"))
        self.assertEqual(request.target_context["app_kind"], "chat")
        self.assertEqual(request.style_profile["id"], "short")

    def test_provider_probe_endpoint_returns_all_results(self):
        providers = [
            ProviderReadiness("claude_cli", "ready", 1, "Claude Code CLI is available"),
            ProviderReadiness("openai_compatible", "unconfigured", 2, "Configure a model"),
        ]
        with patch.object(server.text_processing_service, "probe_providers", return_value=providers) as probe:
            response = asyncio.run(
                server.probe_text_providers(
                    server.TextProviderProbePayload(
                        model="qwen3:8b",
                        base_url="http://127.0.0.1:11434/v1",
                    )
                )
            )

        self.assertEqual(len(response["providers"]), 2)
        self.assertEqual(response["providers"][0]["status"], "ready")
        probe.assert_called_once_with(
            model="qwen3:8b",
            base_url="http://127.0.0.1:11434/v1",
        )

    def test_lifespan_calls_preload_once(self):
        async def run_lifespan():
            async with server.lifespan(server.app):
                return None

        with (
            patch.object(server, "preload_models", new=AsyncMock()) as preload,
            patch.object(server.text_processing_task_service, "shutdown") as shutdown,
        ):
            asyncio.run(run_lifespan())

        preload.assert_awaited_once_with()
        shutdown.assert_called_once_with()

    def test_text_task_endpoints_use_task_service_contract(self):
        pending = {"task_id": "task-1", "status": "pending", "result": None, "error": None}
        running = {"task_id": "task-1", "status": "running", "result": None, "error": None}
        cancelled = {"task_id": "task-1", "status": "cancelled", "result": None, "error": None}
        with (
            patch.object(server.text_processing_task_service, "start", return_value=pending) as start,
            patch.object(server.text_processing_task_service, "get", return_value=running) as get,
            patch.object(server.text_processing_task_service, "cancel", return_value=cancelled) as cancel,
        ):
            payload = server.TextProcessPayload(
                text="raw transcript",
                profile="light",
                provider="claude_cli",
                target_context={"app_kind": "chat"},
            )
            self.assertEqual(asyncio.run(server.start_text_processing_task(payload)), pending)
            self.assertEqual(asyncio.run(server.get_text_processing_task("task-1")), running)
            self.assertEqual(asyncio.run(server.cancel_text_processing_task("task-1")), cancelled)

        request = start.call_args.args[0]
        self.assertEqual(request.text, "raw transcript")
        self.assertEqual(request.target_context["app_kind"], "chat")
        get.assert_called_once_with("task-1")
        cancel.assert_called_once_with("task-1")

    def test_text_task_endpoints_return_404_for_unknown_task(self):
        with patch.object(server.text_processing_task_service, "get", return_value=None):
            with self.assertRaises(HTTPException) as get_error:
                asyncio.run(server.get_text_processing_task("missing"))

        with patch.object(server.text_processing_task_service, "cancel", return_value=None):
            with self.assertRaises(HTTPException) as cancel_error:
                asyncio.run(server.cancel_text_processing_task("missing"))

        self.assertEqual(get_error.exception.status_code, 404)
        self.assertEqual(cancel_error.exception.status_code, 404)

    def test_deferred_transcribe_forces_raw_processing_contract(self):
        mock_asr = {
            "text": "raw transcript",
            "segments": [],
            "duration": 1.0,
        }
        with (
            patch.object(server, "MOCK_MODE", True),
            patch.object(server, "mock_transcribe", return_value=mock_asr),
            patch.object(server, "ensure_engine_loaded", new=AsyncMock(return_value={})),
            patch.object(
                server.text_processing_service,
                "process",
                return_value=self.raw_result(),
            ) as process,
        ):
            response = asyncio.run(
                self.transcribe(
                    defer_text_processing=True,
                    text_processing_profile="light",
                    target_app_kind="chat",
                )
            )

        self.assertEqual(response.text_processing["status"], "skipped")
        self.assertEqual(process.call_args.args[0].profile, "raw")

    def test_legacy_transcribe_keeps_combined_processing(self):
        mock_asr = {
            "text": "raw transcript",
            "segments": [],
            "duration": 1.0,
        }
        combined = TextProcessingResult(
            raw_text="raw transcript",
            text="Polished transcript.",
            profile="light",
            provider="claude_cli",
            model=None,
            status="processed",
            duration_ms=12,
        )
        with (
            patch.object(server, "MOCK_MODE", True),
            patch.object(server, "mock_transcribe", return_value=mock_asr),
            patch.object(server, "ensure_engine_loaded", new=AsyncMock(return_value={})),
            patch.object(server.text_processing_service, "process", return_value=combined) as process,
        ):
            response = asyncio.run(
                self.transcribe(
                    defer_text_processing=False,
                    text_processing_profile="light",
                )
            )

        self.assertEqual(response.text, "Polished transcript.")
        self.assertEqual(process.call_args.args[0].profile, "light")

    @staticmethod
    async def transcribe(
        *,
        defer_text_processing,
        text_processing_profile,
        target_app_kind=None,
    ):
        return await server.transcribe(
            audio=UploadFile(filename="recording.wav", file=io.BytesIO(b"RIFFmock")),
            engine="whisper",
            model="large-v3",
            asr_engine="whisper",
            asr_model="large-v3",
            diarization_model=None,
            speaker_mapping_model=None,
            language="en",
            enable_diarization=False,
            hotwords="",
            text_processing_profile=text_processing_profile,
            text_processing_provider="claude_cli",
            text_processing_model="",
            text_processing_base_url="",
            text_processing_target_language="",
            target_app_kind=target_app_kind,
            target_executable_name=None,
            target_captured_at=None,
            defer_text_processing=defer_text_processing,
            enable_ai_refine=None,
        )


if __name__ == "__main__":
    unittest.main()
