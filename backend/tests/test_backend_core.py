"""Grouped backend tests."""

##############################################################################
# Source: backend/tests/test_ai_refiner.py
##############################################################################

import pytest
from postprocess.ai_refiner import AIRefiner


class TestAIRefiner:
    def test_init_default_provider(self):
        refiner = AIRefiner()
        assert refiner.provider == "claude_cli"

    def test_init_custom_provider(self):
        refiner = AIRefiner(provider="anthropic_api")
        assert refiner.provider == "anthropic_api"

    def test_should_refine_with_hotwords(self):
        refiner = AIRefiner()
        assert refiner.should_refine("中文文本", ["LLM", "GPT"]) is True

    def test_should_not_refine_without_hotwords(self):
        refiner = AIRefiner()
        assert refiner.should_refine("中文文本", []) is True

    def test_build_hotword_prompt(self):
        refiner = AIRefiner()
        prompt = refiner._build_hotword_prompt("测试LM文本", ["LLM", "GPT"])
        assert "LLM" in prompt
        assert "GPT" in prompt
        assert "测试LM文本" in prompt


##############################################################################
# Source: backend/tests/test_firered_engine.py
##############################################################################

import tempfile
import uuid

import numpy as np
import pytest
import soundfile as sf
from engines.firered_engine import FireRedEngine


class TestFireRedEngine:
    def test_models_dict(self):
        assert "firered-aed-l" in FireRedEngine.MODELS
        assert isinstance(FireRedEngine.MODELS["firered-aed-l"], str)

    def test_init(self):
        engine = FireRedEngine()
        assert engine.model is None
        assert engine.loaded_model is None

    def test_transcribe_not_loaded(self):
        engine = FireRedEngine()
        with pytest.raises(RuntimeError, match="not loaded"):
            engine.transcribe("dummy.wav")

    def test_short_audio_is_padded_before_transcribe(self):
        engine = FireRedEngine()
        engine.loaded_model = "firered-aed-l"

        class StubModel:
            def transcribe(self, utt_ids, paths, options):
                audio, sample_rate = sf.read(paths[0])
                duration = len(audio) / sample_rate
                assert duration >= engine.MIN_AUDIO_SECONDS
                return [{"text": "ok"}]

        engine.model = StubModel()

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            audio_path = f.name
        try:
            sf.write(audio_path, np.zeros(800, dtype=np.float32), 16000, subtype="PCM_16")
            result = engine.transcribe(audio_path)
        finally:
            import os
            os.unlink(audio_path)

        assert result["text"] == "ok"
        assert result["duration"] == pytest.approx(0.05, rel=1e-3)

    def test_kernel_error_returns_empty_result_for_short_audio(self):
        engine = FireRedEngine()
        engine.loaded_model = "firered-aed-l"

        class StubModel:
            def transcribe(self, utt_ids, paths, options):
                raise RuntimeError(
                    "Kernel size can't be greater than actual input size"
                )

        engine.model = StubModel()

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            audio_path = f.name
        try:
            sf.write(audio_path, np.zeros(800, dtype=np.float32), 16000, subtype="PCM_16")
            result = engine.transcribe(audio_path)
        finally:
            import os
            os.unlink(audio_path)

        assert result["text"] == ""
        assert result["segments"] == []
        assert result["duration"] == pytest.approx(0.05, rel=1e-3)


##############################################################################
# Source: backend/tests/test_funasr_engine.py
##############################################################################

import shutil
import tempfile
from pathlib import Path

from engines.funasr_engine import FunASREngine


def _make_temp_dir() -> Path:
    base_dir = Path(__file__).resolve().parent / ".tmp"
    base_dir.mkdir(parents=True, exist_ok=True)
    path = base_dir / uuid.uuid4().hex
    path.mkdir(parents=True, exist_ok=False)
    return path


def test_resolve_resource_prefers_local_cache(monkeypatch):
    temp_dir = _make_temp_dir()
    try:
        model_dir = temp_dir / "models"
        local_model = (
            model_dir
            / "iic"
            / "speech_seaco_paraformer_large_asr_nat-zh-cn-16k-common-vocab8404-pytorch"
        )
        local_model.mkdir(parents=True)

        monkeypatch.setenv("VOICESCRIBE_MODEL_DIR", str(model_dir))

        engine = FunASREngine()
        resolved = engine._resolve_resource(
            "iic/speech_seaco_paraformer_large_asr_nat-zh-cn-16k-common-vocab8404-pytorch"
        )

        assert resolved == str(local_model)
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def test_resolve_alias_resource_prefers_local_cache(monkeypatch):
    temp_dir = _make_temp_dir()
    try:
        model_dir = temp_dir / "models"
        local_vad = model_dir / "iic" / "speech_fsmn_vad_zh-cn-16k-common-pytorch"
        local_vad.mkdir(parents=True)

        monkeypatch.setenv("VOICESCRIBE_MODEL_DIR", str(model_dir))

        engine = FunASREngine()
        resolved = engine._resolve_resource("fsmn-vad")

        assert resolved == str(local_vad)
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def test_funasr_load_aligns_resource_revisions_with_official_example(monkeypatch):
    captured_kwargs = {}

    class StubAutoModel:
        def __init__(self, **kwargs):
            captured_kwargs.update(kwargs)

    import sys
    import types

    monkeypatch.setitem(sys.modules, "funasr", types.SimpleNamespace(AutoModel=StubAutoModel))
    monkeypatch.setattr(FunASREngine, "_get_device", lambda self: "cpu")

    engine = FunASREngine()
    engine.load("seaco-paraformer", enable_diarization=True, speaker_model_name="cam++")

    assert captured_kwargs["model_revision"] == "v2.0.4"
    assert captured_kwargs["vad_model_revision"] == "v2.0.4"
    assert captured_kwargs["punc_model_revision"] == "v2.0.4"
    assert captured_kwargs["spk_model_revision"] == "v2.0.2"
    assert captured_kwargs["spk_mode"] == "punc_segment"


##############################################################################
# Source: backend/tests/test_server_models.py
##############################################################################

import sys
import tempfile
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server import _is_model_path_complete
from server import _delete_managed_model_files


def _make_temp_dir() -> Path:
    base_dir = Path(__file__).resolve().parent / ".tmp"
    base_dir.mkdir(parents=True, exist_ok=True)
    path = base_dir / uuid.uuid4().hex
    path.mkdir(parents=True, exist_ok=False)
    return path


def test_hf_model_path_incomplete_when_blob_is_partial():
    temp_dir = _make_temp_dir()
    try:
        model_root = temp_dir / "models--Qwen--Qwen3-ASR-0.6B"
        snapshot = model_root / "snapshots" / "abc123"
        blobs = model_root / "blobs"
        snapshot.mkdir(parents=True)
        blobs.mkdir(parents=True)

        (snapshot / "config.json").write_text("{}", encoding="utf-8")
        (blobs / "partial.safetensors.incomplete").write_text("partial", encoding="utf-8")

        assert _is_model_path_complete("qwen3asr", str(snapshot)) is False
    finally:
        import shutil
        shutil.rmtree(temp_dir, ignore_errors=True)


def test_hf_model_path_complete_when_weight_exists_and_no_partial_blob():
    temp_dir = _make_temp_dir()
    try:
        model_root = temp_dir / "models--Qwen--Qwen3-ASR-0.6B"
        snapshot = model_root / "snapshots" / "abc123"
        snapshot.mkdir(parents=True)

        weight = snapshot / "model.safetensors"
        weight.write_bytes(b"\0" * (11 * 1024 * 1024))

        assert _is_model_path_complete("qwen3asr", str(snapshot)) is True
    finally:
        import shutil
        shutil.rmtree(temp_dir, ignore_errors=True)


def test_non_hf_model_only_requires_existing_path():
    temp_dir = _make_temp_dir()
    try:
        model_dir = temp_dir / "speech_paraformer"
        model_dir.mkdir()

        assert _is_model_path_complete("funasr", str(model_dir)) is True
    finally:
        import shutil
        shutil.rmtree(temp_dir, ignore_errors=True)


def test_delete_hf_model_removes_cache_root_and_locks(monkeypatch):
    temp_dir = _make_temp_dir()
    try:
        hf_home = temp_dir / "huggingface"
        snapshot = hf_home / "models--Qwen--Qwen3-ASR-0.6B" / "snapshots" / "abc123"
        locks = hf_home / ".locks" / "models--Qwen--Qwen3-ASR-0.6B"
        snapshot.mkdir(parents=True)
        locks.mkdir(parents=True)

        (snapshot / "model.safetensors").write_bytes(b"\0" * (11 * 1024 * 1024))
        (locks / "download.lock").write_text("lock", encoding="utf-8")

        monkeypatch.setenv("HF_HOME", str(hf_home))
        _delete_managed_model_files("qwen3asr", str(snapshot))

        assert not (hf_home / "models--Qwen--Qwen3-ASR-0.6B").exists()
        assert not locks.exists()
    finally:
        import shutil
        shutil.rmtree(temp_dir, ignore_errors=True)


##############################################################################
# Source: backend/tests/test_transcribe_observability.py
##############################################################################

import io
import json
import tempfile
import wave
from pathlib import Path

from fastapi.testclient import TestClient

import server


def _make_wav_bytes(duration_s: float = 0.1, sample_rate: int = 16000) -> bytes:
    frames = max(1, int(duration_s * sample_rate))
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        handle.writeframes(b"\x00\x00" * frames)
    return buffer.getvalue()


def _make_invalid_audio_bytes() -> bytes:
    return b"not-a-valid-wave-file"


def _read_events(log_dir):
    events_path = log_dir / "events.jsonl"
    if not events_path.exists():
        return []
    return [
        json.loads(line)
        for line in events_path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def _make_log_dir() -> Path:
    base_dir = Path(__file__).resolve().parent / ".pytest-logs"
    base_dir.mkdir(parents=True, exist_ok=True)
    path = base_dir / uuid.uuid4().hex
    path.mkdir(parents=True, exist_ok=False)
    return path


def test_transcribe_emits_structured_events_in_mock_mode(monkeypatch):
    log_dir = _make_log_dir()
    monkeypatch.setenv("VOICESCRIBE_LOG_DIR", str(log_dir))
    monkeypatch.setattr(server, "MOCK_MODE", True)

    client = TestClient(server.app)
    response = client.post(
        "/transcribe",
        files={"audio": ("sample.wav", _make_wav_bytes(), "audio/wav")},
        data={
            "engine": "funasr",
            "model": "seaco-paraformer",
            "language": "zh",
        },
        headers={
            "X-Recording-Session-ID": "rec_test_001",
            "X-Transcribe-Request-ID": "req_test_001",
        },
    )

    assert response.status_code == 200
    assert response.json()["engine"] == "funasr (mock)"

    events = _read_events(log_dir)
    names = [event["event"] for event in events]
    assert "transcribe_request_started" in names
    assert "temp_audio_written" in names
    assert "uploaded_audio_probed" in names
    assert "transcribe_response_sent" in names

    request_started = next(
        event for event in events if event["event"] == "transcribe_request_started"
    )
    assert request_started["recording_session_id"] == "rec_test_001"
    assert request_started["transcribe_request_id"] == "req_test_001"

    audio_probed = next(
        event for event in events if event["event"] == "uploaded_audio_probed"
    )
    assert audio_probed["audio_probe_ok"] is True
    assert audio_probed["audio_duration_s"] > 0


def test_transcribe_logs_failures_with_classification(monkeypatch):
    log_dir = _make_log_dir()
    monkeypatch.setenv("VOICESCRIBE_LOG_DIR", str(log_dir))
    monkeypatch.setattr(server, "MOCK_MODE", False)
    monkeypatch.setattr(server, "WHISPER_AVAILABLE", True)

    class BrokenEngine:
        def transcribe(self, audio_path, language="zh", **kwargs):
            raise RuntimeError("synthetic engine failure")

    monkeypatch.setattr(
        server,
        "engines",
        {"whisper": {"engine": BrokenEngine(), "model": "large-v3"}},
    )

    client = TestClient(server.app, raise_server_exceptions=False)
    response = client.post(
        "/transcribe",
        files={"audio": ("broken.wav", _make_wav_bytes(), "audio/wav")},
        data={
            "engine": "whisper",
            "model": "large-v3",
            "language": "zh",
        },
        headers={
            "X-Recording-Session-ID": "rec_test_002",
            "X-Transcribe-Request-ID": "req_test_002",
        },
    )

    assert response.status_code == 500
    assert response.json()["detail"] == "Transcription failed"

    events = _read_events(log_dir)
    failed = next(event for event in events if event["event"] == "transcribe_failed")
    assert failed["recording_session_id"] == "rec_test_002"
    assert failed["transcribe_request_id"] == "req_test_002"
    assert failed["stage"] == "engine_transcribe"
    assert failed["error_type"] == "engine_inference_failure"
    assert failed["exception_type"] == "RuntimeError"


def test_transcribe_rejects_empty_audio(monkeypatch):
    log_dir = _make_log_dir()
    monkeypatch.setenv("VOICESCRIBE_LOG_DIR", str(log_dir))
    monkeypatch.setattr(server, "MOCK_MODE", True)

    client = TestClient(server.app, raise_server_exceptions=False)
    response = client.post(
        "/transcribe",
        files={"audio": ("empty.wav", b"", "audio/wav")},
        data={"engine": "funasr", "model": "seaco-paraformer", "language": "zh"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Empty audio upload"

    events = _read_events(log_dir)
    failed = next(event for event in events if event["event"] == "transcribe_failed")
    assert failed["error_type"] == "empty_audio"


def test_transcribe_rejects_invalid_wav(monkeypatch):
    log_dir = _make_log_dir()
    monkeypatch.setenv("VOICESCRIBE_LOG_DIR", str(log_dir))
    monkeypatch.setattr(server, "MOCK_MODE", True)

    client = TestClient(server.app, raise_server_exceptions=False)
    response = client.post(
        "/transcribe",
        files={"audio": ("broken.wav", _make_invalid_audio_bytes(), "audio/wav")},
        data={"engine": "funasr", "model": "seaco-paraformer", "language": "zh"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid or unsupported audio file"

    events = _read_events(log_dir)
    failed = next(event for event in events if event["event"] == "transcribe_failed")
    assert failed["error_type"] == "invalid_audio"


def test_transcribe_rejects_long_silence(monkeypatch):
    log_dir = _make_log_dir()
    monkeypatch.setenv("VOICESCRIBE_LOG_DIR", str(log_dir))
    monkeypatch.setattr(server, "MOCK_MODE", True)

    client = TestClient(server.app, raise_server_exceptions=False)
    response = client.post(
        "/transcribe",
        files={"audio": ("silence.wav", _make_wav_bytes(duration_s=2.0), "audio/wav")},
        data={"engine": "funasr", "model": "seaco-paraformer", "language": "zh"},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "No speech detected in audio"

    events = _read_events(log_dir)
    failed = next(event for event in events if event["event"] == "transcribe_failed")
    assert failed["error_type"] == "no_speech_detected"


def test_reload_speaker_models_mapping_only_skips_offline_diarizer(monkeypatch):
    calls: dict[str, object] = {}

    def fake_reload_speaker_tracker(*, preload_cluster, preload_mapping, sv_model_name):
        calls["tracker"] = {
            "preload_cluster": preload_cluster,
            "preload_mapping": preload_mapping,
            "sv_model_name": sv_model_name,
        }
        return {
            "backend": "funasr",
            "cluster_backend": None,
            "mapping_backend": "funasr",
            "requested_cluster": preload_cluster,
            "requested_mapping": preload_mapping,
            "available": True,
        }

    def fail_new_speaker_diarizer():
        raise AssertionError("offline diarizer should not be preloaded by reload-models")

    monkeypatch.setattr(server, "MOCK_MODE", False)
    monkeypatch.setattr(server, "DIARIZATION_AVAILABLE", True)
    monkeypatch.setattr(server, "diarizer", object())
    monkeypatch.setattr(server, "_new_speaker_diarizer", fail_new_speaker_diarizer)
    monkeypatch.setattr(
        "meeting.speaker_tracker.reload_speaker_tracker",
        fake_reload_speaker_tracker,
    )

    client = TestClient(server.app)
    response = client.post(
        "/speakers/reload-models?preload=true&enable_streaming=false&enable_diarization=true&speaker_model=cam%2B%2B"
    )

    assert response.status_code == 200
    payload = response.json()
    assert calls["tracker"] == {
        "preload_cluster": False,
        "preload_mapping": True,
        "sv_model_name": "cam++",
    }
    assert payload["stream_tracker"]["available"] is True
    assert payload["diarizer_status"] == "disabled"
    assert payload["diarizer_error"] is None
    assert server.diarizer is None


def test_transcribe_loads_offline_diarizer_when_existing_instance_has_no_diarization_model(monkeypatch):
    class FakeEngine:
        def transcribe(self, audio_path, language="zh", **kwargs):
            return {
                "text": "hello world",
                "segments": [{"start": 0.0, "end": 0.5, "text": "hello world"}],
                "duration": 0.5,
            }

    class FakeDiarizer:
        def __init__(self):
            self.diarization_model = None
            self.sv_model = object()
            self.speakers = {}
            self.load_calls: list[bool] = []

        def load(self, load_diarization: bool = True):
            self.load_calls.append(load_diarization)
            if load_diarization:
                self.diarization_model = object()

        def diarize(self, audio_path):
            return [
                {"start": 0.0, "end": 0.2, "speaker": "SPEAKER_00"},
                {"start": 0.2, "end": 0.5, "speaker": "SPEAKER_01"},
            ]

        def assign_speakers(self, result, speakers, audio_path=None):
            result = dict(result)
            result["segments"] = [
                {
                    "start": item["start"],
                    "end": item["end"],
                    "text": f"seg-{index}",
                    "speaker": item["speaker"],
                }
                for index, item in enumerate(speakers)
            ]
            result["text"] = "\n".join(
                f"[{item['speaker']}] seg-{index}" for index, item in enumerate(speakers)
            )
            return result

    monkeypatch.setattr(server, "MOCK_MODE", False)
    monkeypatch.setattr(server, "DIARIZATION_AVAILABLE", True)
    monkeypatch.setattr(server, "WHISPER_AVAILABLE", True)
    monkeypatch.setattr(server, "engines", {"whisper": {"engine": FakeEngine(), "model": "large-v3"}})
    fake_diarizer = FakeDiarizer()
    monkeypatch.setattr(server, "diarizer", fake_diarizer)

    client = TestClient(server.app, raise_server_exceptions=False)
    response = client.post(
        "/transcribe",
        files={"audio": ("sample.wav", _make_wav_bytes(duration_s=0.5), "audio/wav")},
        data={
            "engine": "whisper",
            "model": "large-v3",
            "language": "zh",
            "enable_diarization": "true",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert fake_diarizer.load_calls == [True]
    assert len(payload["segments"]) == 2
    assert payload["segments"][0]["speaker"] == "SPEAKER_00"
    assert payload["segments"][1]["speaker"] == "SPEAKER_01"

