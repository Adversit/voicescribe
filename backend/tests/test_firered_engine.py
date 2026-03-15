import tempfile

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
