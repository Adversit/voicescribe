import sys
import tempfile
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server import _is_model_path_complete
from server import _delete_managed_model_files


def _make_temp_dir() -> Path:
    base_dir = Path(__file__).resolve().parent / ".tmp"
    base_dir.mkdir(exist_ok=True)
    return Path(tempfile.mkdtemp(dir=base_dir))


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
