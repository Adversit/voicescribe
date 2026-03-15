import shutil
import tempfile
from pathlib import Path

from diarization.speaker_models import resolve_hf_repo_for_load


def _make_temp_dir() -> Path:
    base_dir = Path(__file__).resolve().parent / ".tmp"
    base_dir.mkdir(exist_ok=True)
    return Path(tempfile.mkdtemp(dir=base_dir))


def test_resolve_hf_repo_for_load_does_not_use_user_cache():
    temp_dir = _make_temp_dir()
    try:
        project_hf_home = temp_dir / "project_hf"
        user_hf_home = temp_dir / "user_hf" / "hub" / "models--pyannote--embedding" / "snapshots" / "abc123"
        user_hf_home.mkdir(parents=True)
        (user_hf_home / "pytorch_model.bin").write_bytes(b"weights")

        resolved = resolve_hf_repo_for_load(
            "pyannote/embedding",
            project_hf_home=str(project_hf_home),
        )

        assert resolved == "pyannote/embedding"
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def test_resolve_hf_repo_for_load_prefers_project_snapshot():
    temp_dir = _make_temp_dir()
    try:
        project_hf_home = temp_dir / "project_hf"
        snapshot = project_hf_home / "hub" / "models--pyannote--embedding" / "snapshots" / "abc123"
        snapshot.mkdir(parents=True)
        (snapshot / "pytorch_model.bin").write_bytes(b"weights")

        resolved = resolve_hf_repo_for_load(
            "pyannote/embedding",
            project_hf_home=str(project_hf_home),
        )

        assert resolved == str(snapshot)
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
