"""Speaker verification model aliases and project cache helpers."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

DEFAULT_MODEL_DIR = r"D:\learn\AIGC\voicescribe\voicescribe\models"

SPEAKER_SV_MODEL_CANDIDATES: dict[str, list[str]] = {
    "cam++": [
        "damo/speech_campplus_sv_zh-cn_16k-common",
        "iic/speech_campplus_sv_zh-cn_16k-common",
    ],
    "eres2netv2": [
        "iic/speech_eres2netv2_sv_zh-cn_16k-common",
    ],
    "eres2net-large": [
        "iic/speech_eres2net_sv_zh-cn_16k-common",
        "iic/speech_eres2net_base_sv_zh-cn_cnceleb_16k",
    ],
}


def normalize_speaker_model_name(model_name: Optional[str]) -> str:
    """Normalize aliases and fallback to cam++."""
    if not model_name:
        return "cam++"

    value = str(model_name).strip().lower()
    alias_map = {
        "campp": "cam++",
        "campplus": "cam++",
        "cam++": "cam++",
        "eres2net-v2": "eres2netv2",
        "eres2netv2": "eres2netv2",
        "eres2net_large": "eres2net-large",
        "eres2net-large": "eres2net-large",
        "eres2net": "eres2net-large",
    }
    normalized = alias_map.get(value, value)
    if normalized in SPEAKER_SV_MODEL_CANDIDATES:
        return normalized
    return "cam++"


def get_speaker_model_candidates(model_name: Optional[str]) -> list[str]:
    """Return candidate model IDs for download/load."""
    normalized = normalize_speaker_model_name(model_name)
    return SPEAKER_SV_MODEL_CANDIDATES.get(
        normalized, SPEAKER_SV_MODEL_CANDIDATES["cam++"]
    )


def get_speaker_models() -> list[str]:
    """Return supported speaker model aliases."""
    return list(SPEAKER_SV_MODEL_CANDIDATES.keys())


def get_model_cache_dir() -> str:
    """Return the speaker/asr model cache directory."""
    return os.environ.get("VOICESCRIBE_MODEL_DIR", DEFAULT_MODEL_DIR)


def ensure_model_cache_dir() -> str:
    """Create and return the project model cache directory."""
    model_dir = Path(get_model_cache_dir())
    model_dir.mkdir(parents=True, exist_ok=True)
    return str(model_dir)


def resolve_local_model_path(model_id: str, cache_dir: Optional[str] = None) -> str:
    """Resolve to a local path under cache dir if it already exists."""
    base = cache_dir or get_model_cache_dir()
    local_path = os.path.join(base, model_id.replace("/", os.sep))
    if os.path.isdir(local_path):
        return local_path
    return model_id


def resolve_speaker_model_for_load(model_name: Optional[str]) -> tuple[str, str]:
    """Resolve alias + best load target (local path preferred)."""
    normalized = normalize_speaker_model_name(model_name)
    candidates = get_speaker_model_candidates(normalized)

    cache_dir = get_model_cache_dir()
    for model_id in candidates:
        resolved = resolve_local_model_path(model_id, cache_dir=cache_dir)
        if resolved != model_id:
            return normalized, resolved

    return normalized, candidates[0]


def speaker_model_relative_dirs(model_name: Optional[str]) -> list[str]:
    """Return relative model directories under cache root."""
    return [model_id.replace("/", os.sep) for model_id in get_speaker_model_candidates(model_name)]


def hf_repo_dir_name(repo_id: str) -> str:
    """Convert a HF repo ID to its cache directory name."""
    return "models--" + repo_id.replace("/", "--")


def get_project_hf_home(cache_dir: Optional[str] = None) -> str:
    """Return the project-scoped HF cache root."""
    return os.path.join(cache_dir or get_model_cache_dir(), "huggingface")


def _latest_snapshot_dir(repo_root: Path) -> Optional[Path]:
    snapshots_dir = repo_root / "snapshots"
    if not snapshots_dir.is_dir():
        return None

    snapshot_dirs = [path for path in snapshots_dir.iterdir() if path.is_dir()]
    if not snapshot_dirs:
        return None
    return max(snapshot_dirs, key=lambda path: path.stat().st_mtime)


def resolve_hf_repo_for_load(
    repo_id: str,
    project_hf_home: Optional[str] = None,
) -> str:
    """Resolve a HF repo to a local project snapshot path when available."""
    repo_root = (
        Path(project_hf_home or get_project_hf_home())
        / "hub"
        / hf_repo_dir_name(repo_id)
    )
    if not repo_root.exists():
        return repo_id

    snapshot_dir = _latest_snapshot_dir(repo_root)
    if snapshot_dir is not None:
        return str(snapshot_dir)
    return str(repo_root)
