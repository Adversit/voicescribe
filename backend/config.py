import os
import shutil
import sys
from pathlib import Path
from typing import Optional


APP_NAME = "VoiceScribe"
_BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = Path(
    os.environ.get("VOICESCRIBE_ROOT", str(_BACKEND_DIR.parent))
).resolve()


def _looks_like_repo_checkout(path: Path) -> bool:
    return (path / "backend").exists() and (path / "app").exists()


def _platform_app_data_dir() -> Path:
    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA")
        if base:
            return Path(base) / APP_NAME
    elif sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / APP_NAME

    xdg = os.environ.get("XDG_DATA_HOME")
    if xdg:
        return Path(xdg) / APP_NAME
    return Path.home() / ".local" / "share" / APP_NAME


def _default_runtime_root() -> Path:
    env_runtime_root = os.environ.get("VOICESCRIBE_RUNTIME_DIR")
    if env_runtime_root:
        return Path(env_runtime_root).expanduser().resolve()

    if _looks_like_repo_checkout(PROJECT_ROOT):
        return PROJECT_ROOT

    return _platform_app_data_dir()


RUNTIME_ROOT = _default_runtime_root()

MODEL_CACHE_DIR = Path(
    os.environ.get("VOICESCRIBE_MODEL_DIR", str(RUNTIME_ROOT / "models"))
).expanduser().resolve()
MODELSCOPE_CACHE = str(MODEL_CACHE_DIR)
MODEL_REGISTRY_PATH = MODEL_CACHE_DIR / "voicescribe_models.json"

WHISPER_CPP_MODEL_DIR = Path(
    os.environ.get(
        "VOICESCRIBE_WHISPERCPP_MODEL_DIR",
        str(MODEL_CACHE_DIR / "whisper-cpp"),
    )
).expanduser().resolve()

SPEAKER_DATA_DIR = Path(
    os.environ.get("VOICESCRIBE_SPEAKER_DIR", str(RUNTIME_ROOT / "data" / "speakers"))
).expanduser().resolve()

CONFIG_DIR = Path(
    os.environ.get("VOICESCRIBE_CONFIG_DIR", str(RUNTIME_ROOT / "config"))
).expanduser().resolve()


def ensure_dirs() -> None:
    for path in [MODEL_CACHE_DIR, WHISPER_CPP_MODEL_DIR, SPEAKER_DATA_DIR, CONFIG_DIR]:
        path.mkdir(parents=True, exist_ok=True)


def find_whisper_cli() -> Optional[str]:
    env_path = os.environ.get("VOICESCRIBE_WHISPERCPP_CLI")
    if env_path and Path(env_path).exists():
        return env_path

    candidates = ["whisper-cli", "main"]
    for candidate in candidates:
        found = shutil.which(candidate)
        if found:
            return found

    if sys.platform == "darwin":
        platform_candidates = [
            "/opt/homebrew/bin/whisper-cli",
            "/usr/local/bin/whisper-cli",
        ]
    elif sys.platform == "win32":
        local_app_data = os.environ.get("LOCALAPPDATA", "")
        platform_candidates = [
            str(Path.home() / "whisper.cpp" / "build" / "bin" / "Release" / "whisper-cli.exe"),
            str(Path.home() / "whisper.cpp" / "build" / "bin" / "main.exe"),
            str(Path(local_app_data) / "whisper-cpp" / "whisper-cli.exe"),
            str(Path(local_app_data) / "whisper-cpp" / "main.exe"),
        ]
    else:
        platform_candidates = [
            "/usr/bin/whisper-cli",
            "/usr/local/bin/whisper-cli",
        ]

    for candidate in platform_candidates:
        if candidate and Path(candidate).exists():
            return candidate

    return None
