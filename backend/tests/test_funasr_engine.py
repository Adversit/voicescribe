import shutil
import tempfile
from pathlib import Path

from engines.funasr_engine import FunASREngine


def _make_temp_dir() -> Path:
    base_dir = Path(__file__).resolve().parent / ".tmp"
    base_dir.mkdir(exist_ok=True)
    return Path(tempfile.mkdtemp(dir=base_dir))


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
