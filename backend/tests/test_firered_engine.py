import pytest
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
