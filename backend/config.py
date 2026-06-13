import os
import shutil
import sys
import tempfile
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


def _resolve_model_cache_dir() -> Path:
    default_dir = (PROJECT_ROOT / "models").expanduser().resolve()
    configured = os.environ.get("VOICESCRIBE_MODEL_DIR")
    if not configured:
        return default_dir

    candidate = Path(configured).expanduser().resolve()
    try:
        candidate.relative_to(PROJECT_ROOT)
    except ValueError:
        return default_dir
    return candidate


MODEL_CACHE_DIR = _resolve_model_cache_dir()
MODELSCOPE_CACHE = str(MODEL_CACHE_DIR)
MODEL_REGISTRY_PATH = MODEL_CACHE_DIR / "voicescribe_models.json"
HF_HOME_DIR = (MODEL_CACHE_DIR / "huggingface").resolve()
HUGGINGFACE_HUB_CACHE = (HF_HOME_DIR / "hub").resolve()
HF_DATASETS_CACHE = (HF_HOME_DIR / "datasets").resolve()
TRANSFORMERS_CACHE_DIR = (HF_HOME_DIR / "transformers").resolve()
TORCH_CACHE_DIR = (MODEL_CACHE_DIR / "torch").resolve()
JIEBA_CACHE_DIR = (MODEL_CACHE_DIR / "jieba").resolve()
JIEBA_CACHE_FILE = (JIEBA_CACHE_DIR / "jieba.cache").resolve()
FFMPEG_ROOT_DIR = Path(
    os.environ.get("VOICESCRIBE_FFMPEG_DIR", str(PROJECT_ROOT / "tools" / "ffmpeg"))
).expanduser().resolve()

LEGACY_MODELSCOPE_CACHE_DIR = (Path.home() / ".cache" / "modelscope").resolve()
LEGACY_HF_CACHE_DIR = (Path.home() / ".cache" / "huggingface").resolve()
LEGACY_JIEBA_CACHE_FILE = (Path(tempfile.gettempdir()) / "jieba.cache").resolve()

WHISPER_CPP_MODEL_DIR = Path(
    os.environ.get(
        "VOICESCRIBE_WHISPERCPP_MODEL_DIR",
        str(MODEL_CACHE_DIR / "whisper-cpp"),
    )
).expanduser().resolve()

SPEAKER_DATA_DIR = Path(
    os.environ.get("VOICESCRIBE_SPEAKER_DIR", str(RUNTIME_ROOT / "data" / "speakers"))
).expanduser().resolve()

HISTORY_DATA_DIR = Path(
    os.environ.get("VOICESCRIBE_HISTORY_DIR", str(RUNTIME_ROOT / "data" / "history"))
).expanduser().resolve()

HISTORY_STORAGE_PATH = HISTORY_DATA_DIR / "history.json"

CONFIG_DIR = Path(
    os.environ.get("VOICESCRIBE_CONFIG_DIR", str(RUNTIME_ROOT / "config"))
).expanduser().resolve()


def resolve_ffmpeg_bin_dir() -> Optional[Path]:
    candidates = [
        FFMPEG_ROOT_DIR / "bin",
        FFMPEG_ROOT_DIR,
    ]
    for candidate in candidates:
        ffmpeg_exe = candidate / ("ffmpeg.exe" if sys.platform == "win32" else "ffmpeg")
        if ffmpeg_exe.exists():
            return candidate.resolve()
    return None


def resolve_ffprobe_path() -> Optional[Path]:
    ffmpeg_bin_dir = resolve_ffmpeg_bin_dir()
    if not ffmpeg_bin_dir:
        return None
    candidate = ffmpeg_bin_dir / ("ffprobe.exe" if sys.platform == "win32" else "ffprobe")
    if candidate.exists():
        return candidate.resolve()
    return None


def prepend_env_path(candidate: Optional[Path]) -> None:
    if not candidate:
        return

    candidate_str = str(candidate)
    path_entries = os.environ.get("PATH", "").split(os.pathsep) if os.environ.get("PATH") else []
    if candidate_str in path_entries:
        return

    os.environ["PATH"] = candidate_str + os.pathsep + os.environ.get("PATH", "")


def ensure_runtime_env() -> None:
    os.environ["MODELSCOPE_CACHE"] = MODELSCOPE_CACHE
    os.environ["HF_HOME"] = str(HF_HOME_DIR)
    os.environ["HUGGINGFACE_HUB_CACHE"] = str(HUGGINGFACE_HUB_CACHE)
    os.environ["HF_DATASETS_CACHE"] = str(HF_DATASETS_CACHE)
    os.environ["TRANSFORMERS_CACHE"] = str(TRANSFORMERS_CACHE_DIR)
    os.environ["TORCH_HOME"] = str(TORCH_CACHE_DIR)
    os.environ["OLLAMA_MODELS"] = str(MODEL_CACHE_DIR / "ollama")
    os.environ["VOICESCRIBE_JIEBA_CACHE_DIR"] = str(JIEBA_CACHE_DIR)
    os.environ["VOICESCRIBE_JIEBA_CACHE_FILE"] = str(JIEBA_CACHE_FILE)
    os.environ["VOICESCRIBE_FFMPEG_DIR"] = str(FFMPEG_ROOT_DIR)

    ffmpeg_bin_dir = resolve_ffmpeg_bin_dir()
    prepend_env_path(ffmpeg_bin_dir)

    ffprobe_path = resolve_ffprobe_path()
    if ffprobe_path:
        os.environ.setdefault("VOICESCRIBE_FFPROBE", str(ffprobe_path))


def resolve_modelscope_model_dir(model: str, revision: Optional[str] = None) -> str:
    candidate = Path(model).expanduser()
    if candidate.exists():
        return str(candidate.resolve())

    local_dir = MODEL_CACHE_DIR.joinpath(*model.split("/")).resolve()
    if local_dir.exists():
        return str(local_dir)

    ensure_runtime_env()
    from modelscope.hub.snapshot_download import snapshot_download

    downloaded_dir = snapshot_download(
        model,
        revision=revision,
        cache_dir=str(MODEL_CACHE_DIR),
    )
    return str(Path(downloaded_dir).resolve())


def ensure_dirs() -> None:
    for path in [
        MODEL_CACHE_DIR,
        WHISPER_CPP_MODEL_DIR,
        HF_HOME_DIR,
        HUGGINGFACE_HUB_CACHE,
        HF_DATASETS_CACHE,
        TRANSFORMERS_CACHE_DIR,
        TORCH_CACHE_DIR,
        JIEBA_CACHE_DIR,
        SPEAKER_DATA_DIR,
        HISTORY_DATA_DIR,
        CONFIG_DIR,
    ]:
        path.mkdir(parents=True, exist_ok=True)


def _merge_move_tree(source: Path, target: Path) -> list[str]:
    messages: list[str] = []
    if not source.exists():
        return messages

    target.mkdir(parents=True, exist_ok=True)
    for entry in source.iterdir():
        destination = target / entry.name
        if entry.is_dir():
            if destination.exists() and destination.is_dir():
                messages.extend(_merge_move_tree(entry, destination))
                if entry.exists():
                    try:
                        next(entry.iterdir())
                    except StopIteration:
                        entry.rmdir()
            elif destination.exists():
                messages.append(f"skip_conflict={entry}->{destination}")
            else:
                shutil.move(str(entry), str(destination))
                messages.append(f"move_dir={entry}->{destination}")
        else:
            if destination.exists():
                if entry.name == ".msc":
                    entry.unlink()
                    messages.append(f"drop_legacy_manifest={entry}")
                    continue

                same_size = False
                try:
                    same_size = destination.stat().st_size == entry.stat().st_size
                except OSError:
                    same_size = False

                if same_size:
                    entry.unlink()
                    messages.append(f"drop_duplicate_file={entry}")
                else:
                    messages.append(f"skip_conflict={entry}->{destination}")
            else:
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(entry), str(destination))
                messages.append(f"move_file={entry}->{destination}")

    if source.exists():
        try:
            next(source.iterdir())
        except StopIteration:
            source.rmdir()

    return messages


def migrate_legacy_caches() -> list[str]:
    ensure_dirs()
    messages: list[str] = []
    messages.extend(_merge_move_tree(LEGACY_MODELSCOPE_CACHE_DIR, MODEL_CACHE_DIR))
    messages.extend(_merge_move_tree(LEGACY_HF_CACHE_DIR, HF_HOME_DIR))

    if LEGACY_JIEBA_CACHE_FILE.exists():
        JIEBA_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        if JIEBA_CACHE_FILE.exists():
            same_size = JIEBA_CACHE_FILE.stat().st_size == LEGACY_JIEBA_CACHE_FILE.stat().st_size
            if same_size:
                LEGACY_JIEBA_CACHE_FILE.unlink()
                messages.append(f"drop_duplicate_file={LEGACY_JIEBA_CACHE_FILE}")
            else:
                backup = JIEBA_CACHE_DIR / "jieba.legacy.cache"
                shutil.move(str(LEGACY_JIEBA_CACHE_FILE), str(backup))
                messages.append(f"move_file={LEGACY_JIEBA_CACHE_FILE}->{backup}")
        else:
            shutil.move(str(LEGACY_JIEBA_CACHE_FILE), str(JIEBA_CACHE_FILE))
            messages.append(f"move_file={LEGACY_JIEBA_CACHE_FILE}->{JIEBA_CACHE_FILE}")

    return messages


def configure_jieba_cache() -> None:
    ensure_dirs()
    try:
        import jieba

        jieba.dt.tmp_dir = str(JIEBA_CACHE_DIR)
        jieba.dt.cache_file = str(JIEBA_CACHE_FILE)

        try:
            import jieba.posseg as posseg

            posseg.dt.tmp_dir = str(JIEBA_CACHE_DIR)
            posseg.dt.cache_file = str(JIEBA_CACHE_FILE)
        except Exception:
            pass
    except Exception:
        pass


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


ensure_runtime_env()
