#!/usr/bin/env python3
"""
VoiceScribe Backend Server
本地语音转文字服务

支持模式：
- mock: 无需 ASR 引擎，返回模拟结果（用于前端开发）
- whisper: 使用 faster-whisper 或 openai-whisper
- funasr: 使用阿里 FunASR

启动命令:
  python server.py              # 自动检测可用引擎
  python server.py --mock       # 强制 mock 模式
"""

import os
import sys
from contextlib import asynccontextmanager

# Load .env file (HF_TOKEN, VOICESCRIBE_MODEL_DIR, etc.)
from dotenv import load_dotenv
load_dotenv()


def _configure_hf_download_env() -> None:
    """Use conservative HuggingFace download defaults for large model files."""
    os.environ.setdefault("HF_HUB_DOWNLOAD_TIMEOUT", "600")
    os.environ.setdefault("HF_HUB_ETAG_TIMEOUT", "60")


_configure_hf_download_env()

# Windows GBK encoding fix: ensure stdout/stderr use UTF-8
if sys.platform == 'win32':
    os.environ.setdefault('PYTHONIOENCODING', 'utf-8')
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import tempfile
import asyncio
from pathlib import Path
from typing import Optional, List
from datetime import datetime
import argparse
import importlib.util
import shutil
import json
import wave
import logging
import time

import numpy as np

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
from diarization.speaker_models import (
    DEFAULT_MODEL_DIR,
    get_model_cache_dir,
    get_speaker_model_candidates,
    get_speaker_models,
    normalize_speaker_model_name,
    speaker_model_relative_dirs,
)
from telemetry import (
    classify_http_error_detail,
    classify_transcribe_error,
    emit_event,
    generate_id,
    probe_audio_file,
)


def _configure_app_logging() -> None:
    """Ensure backend application logs are visible alongside uvicorn logs."""
    debug_logs = os.environ.get("VOICESCRIBE_DEBUG_LOGS") == "1"
    root_logger = logging.getLogger()
    if not root_logger.handlers:
        logging.basicConfig(
            level=logging.INFO if debug_logs else logging.WARNING,
            format="%(levelname)s:%(name)s:%(message)s",
        )
    else:
        root_logger.setLevel(logging.INFO if debug_logs else logging.WARNING)

    for logger_name in ("meeting", "diarization", "engines", "server"):
        logging.getLogger(logger_name).setLevel(logging.INFO)

    for logger_name in ("modelscope", "jieba", "charset_normalizer"):
        logging.getLogger(logger_name).setLevel(
            logging.INFO if debug_logs else logging.WARNING
        )

    for logger_name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logging.getLogger(logger_name).setLevel(logging.INFO)


_configure_app_logging()

def _module_available(name: str) -> bool:
    return importlib.util.find_spec(name) is not None


def _import_ok(module_name: str) -> bool:
    """Check runtime import, not just module discovery."""
    try:
        __import__(module_name)
        return True
    except Exception as e:
        print(f"[Warning] Runtime import failed for {module_name}: {e}")
        return False


def _whispercpp_cli_available() -> bool:
    # whispercpp_engine.py 使用固定路径 /opt/homebrew/bin/whisper-cli
    return os.path.exists("/opt/homebrew/bin/whisper-cli")


def _whispercpp_model_available() -> bool:
    # Managed by model registry and per-model checks.
    return True



# 尝试导入 ASR 引擎
WHISPER_AVAILABLE = False
WHISPERCPP_AVAILABLE = False
FUNASR_AVAILABLE = False
PARAKEET_AVAILABLE = False
FIRERED_AVAILABLE = False
QWEN3_ASR_AVAILABLE = False
FIRERED2_AVAILABLE = False

WHISPER_MODELS = ["tiny", "base", "small", "medium", "large-v2", "large-v3"]
WHISPERCPP_MODELS = ["tiny", "base", "small", "medium", "large"]
FUNASR_MODELS = ["seaco-paraformer", "paraformer-zh", "paraformer-zh-streaming", "sensevoice-small"]
PARAKEET_MODELS = ["parakeet-ctc-1.1b", "parakeet-tdt-1.1b"]
FIRERED_MODELS = ["firered-aed-l"]
QWEN3_ASR_MODELS = ["qwen3-asr-0.6b", "qwen3-asr-1.7b"]
FIRERED2_MODELS = ["fireredasr2-aed", "fireredasr2-llm"]
SPEAKER_MODELS = get_speaker_models()

WHISPER_HF_REPOS = {
    "tiny": "Systran/faster-whisper-tiny",
    "base": "Systran/faster-whisper-base",
    "small": "Systran/faster-whisper-small",
    "medium": "Systran/faster-whisper-medium",
    "large-v2": "Systran/faster-whisper-large-v2",
    "large-v3": "Systran/faster-whisper-large-v3",
}
PARAKEET_HF_REPOS = {
    "parakeet-ctc-1.1b": "nvidia/parakeet-ctc-1.1b",
    "parakeet-tdt-1.1b": "nvidia/parakeet-tdt-1.1b",
}
WHISPERCPP_HF_REPO = "ggerganov/whisper.cpp"
FIRERED_HF_REPOS = {
    "firered-aed-l": "FireRedTeam/FireRedASR-AED-L",
}
QWEN3_ASR_HF_REPOS = {
    "qwen3-asr-0.6b": "Qwen/Qwen3-ASR-0.6B",
    "qwen3-asr-1.7b": "Qwen/Qwen3-ASR-1.7B",
}
FIRERED2_HF_REPOS = {
    "fireredasr2-aed": "FireRedTeam/FireRedASR2-AED",
    "fireredasr2-llm": "FireRedTeam/FireRedASR2-LLM",
}

try:
    from engines.whisper_engine import WhisperEngine
    # faster-whisper 或 whisper 任意可用即可
    WHISPER_AVAILABLE = _import_ok("faster_whisper") or _import_ok("whisper")
    if not WHISPER_AVAILABLE:
        print("[Warning] Whisper engine not available: missing faster_whisper/whisper")
except ImportError as e:
    print(f"[Warning] Whisper engine not available: {e}")

try:
    from engines.whispercpp_engine import WhisperCppEngine
    WHISPERCPP_AVAILABLE = _whispercpp_cli_available() and _whispercpp_model_available()
    if not WHISPERCPP_AVAILABLE:
        print("[Warning] Whisper.cpp engine not available: missing whisper-cli or model")
except Exception as e:
    print(f"[Warning] Whisper.cpp engine not available: {e}")

try:
    from engines.funasr_engine import FunASREngine
    FUNASR_AVAILABLE = _module_available("funasr")
    if not FUNASR_AVAILABLE:
        print("[Warning] FunASR engine not available: missing funasr package")
except ImportError as e:
    print(f"[Warning] FunASR engine not available: {e}")

try:
    from engines.parakeet_engine import ParakeetEngine
    # Parakeet 依赖 nemo_toolkit 和 CUDA，尽量保守标记
    PARAKEET_AVAILABLE = _module_available("nemo") or _module_available("nemo_toolkit")
    if not PARAKEET_AVAILABLE:
        print("[Warning] Parakeet engine not available: missing nemo_toolkit")
except ImportError as e:
    print(f"[Warning] Parakeet engine not available: {e}")

try:
    from engines.firered_engine import FireRedEngine
    FIRERED_AVAILABLE = _module_available("fireredasr")
    if not FIRERED_AVAILABLE:
        print("[Warning] FireRedASR engine not available: missing fireredasr package")
        print("[Warning] Install: pip install git+https://github.com/FireRedTeam/FireRedASR.git")
except ImportError as e:
    print(f"[Warning] FireRedASR engine not available: {e}")

try:
    from engines.qwen3asr_engine import Qwen3ASREngine
    QWEN3_ASR_AVAILABLE = _module_available("qwen_asr")
    if not QWEN3_ASR_AVAILABLE:
        print("[Warning] Qwen3-ASR engine not available: missing qwen_asr package")
except ImportError as e:
    print(f"[Warning] Qwen3-ASR engine not available: {e}")

try:
    from engines.firered2_engine import FireRed2Engine
    FIRERED2_AVAILABLE = _module_available("fireredasr")
    if not FIRERED2_AVAILABLE:
        print("[Warning] FireRedASR2 engine not available: missing fireredasr package")
except ImportError as e:
    print(f"[Warning] FireRedASR2 engine not available: {e}")

# 模型缓存目录（用于下载/管理模型权重）
# 固定默认到项目 models/，可由 VOICESCRIBE_MODEL_DIR 覆盖
MODEL_CACHE_DIR = get_model_cache_dir()
os.environ["VOICESCRIBE_MODEL_DIR"] = MODEL_CACHE_DIR
# 兼容历史 fallback：若 helper 未读取到环境变量，强制使用指定路径
if not MODEL_CACHE_DIR:
    MODEL_CACHE_DIR = DEFAULT_MODEL_DIR
    os.environ["VOICESCRIBE_MODEL_DIR"] = MODEL_CACHE_DIR

# ModelScope stores models at MODELSCOPE_CACHE/models/<org>/<model>,
# so MODELSCOPE_CACHE should be the parent of our models/ directory.
def _derive_modelscope_cache_root(model_dir: str) -> str:
    p = Path(model_dir)
    if p.name.lower() == "models":
        return str(p.parent)
    return str(p)

os.environ.setdefault("MODELSCOPE_CACHE", _derive_modelscope_cache_root(MODEL_CACHE_DIR))
# Redirect all model caches (torch hub, HuggingFace) to project models/ directory
os.environ.setdefault("TORCH_HOME", os.path.join(MODEL_CACHE_DIR, "torch"))
os.environ.setdefault("HF_HOME", os.path.join(MODEL_CACHE_DIR, "huggingface"))

os.makedirs(MODEL_CACHE_DIR, exist_ok=True)

MODEL_REGISTRY_PATH = os.path.join(MODEL_CACHE_DIR, "voicescribe_models.json")

# 下载状态缓存
model_downloads = {}

def _load_registry() -> dict:
    try:
        if os.path.exists(MODEL_REGISTRY_PATH):
            with open(MODEL_REGISTRY_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception as e:
        print(f"[ModelRegistry] Failed to read registry: {e}")
    return {}

def _save_registry(registry: dict) -> None:
    try:
        with open(MODEL_REGISTRY_PATH, "w", encoding="utf-8") as f:
            json.dump(registry, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[ModelRegistry] Failed to write registry: {e}")

def _get_registry_entry(engine: str, model: str) -> Optional[dict]:
    registry = _load_registry()
    return registry.get(engine, {}).get(model)

def _set_registry_entry(engine: str, model: str, path: str, size_bytes: int) -> None:
    registry = _load_registry()
    if engine not in registry:
        registry[engine] = {}
    registry[engine][model] = {
        "path": path,
        "size_bytes": size_bytes,
        "updated_at": datetime.now().isoformat(),
    }
    _save_registry(registry)

def _delete_registry_entry(engine: str, model: str) -> None:
    registry = _load_registry()
    if engine in registry and model in registry[engine]:
        del registry[engine][model]
        _save_registry(registry)

def _dir_size(path: str) -> int:
    total = 0
    for root, _, files in os.walk(path):
        for name in files:
            try:
                total += os.path.getsize(os.path.join(root, name))
            except FileNotFoundError:
                continue
    return total

def _cache_total_size() -> int:
    return _dir_size(MODEL_CACHE_DIR)

# 模型名 → ModelScope 相对路径的映射（用于扫描已有目录）
_FUNASR_MODEL_DIRS = {
    "paraformer-zh": "iic/speech_paraformer-large-vad-punc_asr_nat-zh-cn-16k-common-vocab8404-pytorch",
    "paraformer-zh-streaming": "iic/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-online",
    "seaco-paraformer": "iic/speech_seaco_paraformer_large_asr_nat-zh-cn-16k-common-vocab8404-pytorch",
    "sensevoice-small": "iic/SenseVoiceSmall",
}

_FIRERED_MODEL_DIRS = {
    "firered-aed-l": "huggingface/models--FireRedTeam--FireRedASR-AED-L",
}

_QWEN3_ASR_MODEL_DIRS = {
    "qwen3-asr-0.6b": "huggingface/models--Qwen--Qwen3-ASR-0.6B",
    "qwen3-asr-1.7b": "huggingface/models--Qwen--Qwen3-ASR-1.7B",
}

_FIRERED2_MODEL_DIRS = {
    "fireredasr2-aed": "huggingface/models--FireRedTeam--FireRedASR2-AED",
    "fireredasr2-llm": "huggingface/models--FireRedTeam--FireRedASR2-LLM",
}

_SPEAKER_MODEL_DIRS = {
    model_name: speaker_model_relative_dirs(model_name)
    for model_name in SPEAKER_MODELS
}

def _resolve_hf_snapshot(base_dir: str) -> str:
    """If base_dir is a HF cache root, return the latest snapshot path."""
    snapshots_dir = os.path.join(base_dir, "snapshots")
    if os.path.isdir(snapshots_dir):
        entries = [
            os.path.join(snapshots_dir, d)
            for d in os.listdir(snapshots_dir)
            if os.path.isdir(os.path.join(snapshots_dir, d))
        ]
        if entries:
            return max(entries, key=os.path.getmtime)
    return base_dir


def _hf_cache_root_from_path(path: str) -> str:
    norm_path = os.path.normpath(path)
    parts = norm_path.split(os.sep)
    if "snapshots" in parts:
        idx = parts.index("snapshots")
        if idx > 0:
            return os.sep.join(parts[:idx])
    return norm_path


def _hf_has_incomplete_files(path: str) -> bool:
    for root, _, files in os.walk(path):
        for name in files:
            if name.endswith(".incomplete"):
                return True
    return False


def _hf_has_large_weight_file(path: str) -> bool:
    weight_suffixes = (
        ".safetensors",
        ".bin",
        ".pt",
        ".pth",
        ".ckpt",
        ".onnx",
    )
    min_weight_size = 10 * 1024 * 1024

    for root, _, files in os.walk(path):
        for name in files:
            file_path = os.path.join(root, name)
            lower_name = name.lower()
            if (
                lower_name == "model.pth.tar"
                or lower_name.endswith(weight_suffixes)
            ):
                try:
                    if os.path.getsize(file_path) >= min_weight_size:
                        return True
                except OSError:
                    continue
    return False


def _is_model_path_complete(engine: str, path: str) -> bool:
    if not os.path.exists(path):
        return False

    hf_engines = {"whisper", "parakeet", "firered", "qwen3asr", "firered2"}
    if engine not in hf_engines:
        return True

    snapshot_path = _resolve_hf_snapshot(path)
    cache_root = _hf_cache_root_from_path(path)
    if _hf_has_incomplete_files(cache_root):
        return False
    return _hf_has_large_weight_file(snapshot_path)


def _delete_path_quietly(path: str) -> None:
    if not path or not os.path.exists(path):
        return
    if os.path.isdir(path):
        shutil.rmtree(path, ignore_errors=True)
        return
    try:
        os.remove(path)
    except FileNotFoundError:
        pass


def _delete_managed_model_files(engine: str, path: str) -> None:
    hf_engines = {"whisper", "parakeet", "firered", "qwen3asr", "firered2"}
    if engine not in hf_engines:
        _delete_path_quietly(path)
        return

    cache_root = _hf_cache_root_from_path(path)
    _delete_path_quietly(cache_root)

    hf_home = os.environ.get("HF_HOME", os.path.join(MODEL_CACHE_DIR, "huggingface"))
    try:
        relative_root = os.path.relpath(cache_root, hf_home)
    except ValueError:
        relative_root = os.path.basename(cache_root)

    if relative_root.startswith(".."):
        relative_root = os.path.basename(cache_root)

    lock_root = os.path.join(hf_home, ".locks", relative_root)
    _delete_path_quietly(lock_root)


def _scan_and_register_existing_models() -> None:
    """扫描 MODEL_CACHE_DIR 中已存在的模型目录，自动注册到 registry。"""
    registered = 0
    scan_map = [
        ("funasr", _FUNASR_MODEL_DIRS),
        ("firered", _FIRERED_MODEL_DIRS),
        ("qwen3asr", _QWEN3_ASR_MODEL_DIRS),
        ("firered2", _FIRERED2_MODEL_DIRS),
        ("speaker", _SPEAKER_MODEL_DIRS),
    ]
    for engine_name, model_dirs in scan_map:
        for model_name, rel_paths in model_dirs.items():
            if isinstance(rel_paths, str):
                candidates = [rel_paths]
            else:
                candidates = list(rel_paths)
            for rel_path in candidates:
                full_path = os.path.join(MODEL_CACHE_DIR, rel_path)
                if not os.path.isdir(full_path):
                    continue
                # For HF cache dirs, register the actual snapshot path
                resolved_path = _resolve_hf_snapshot(full_path)
                if not _is_model_path_complete(engine_name, resolved_path):
                    continue
                entry = _get_registry_entry(engine_name, model_name)
                if not entry or not os.path.exists(entry.get("path", "")):
                    size = _dir_size(resolved_path)
                    _set_registry_entry(engine_name, model_name, resolved_path, size)
                    print(f"[ModelRegistry] Auto-registered {engine_name}/{model_name} ({size // 1024 // 1024} MB)")
                    registered += 1
                break
    if registered:
        print(f"[ModelRegistry] Auto-registered {registered} existing model(s).")
    else:
        print("[ModelRegistry] All existing models already registered.")

def _get_fun_asr_model_id(model_name: str) -> Optional[str]:
    try:
        return FunASREngine.MODELS.get(model_name)
    except Exception:
        return None

# Speaker diarization 是可选的
DIARIZATION_AVAILABLE = False
try:
    from diarization.speaker import SpeakerDiarizer
    DIARIZATION_AVAILABLE = True
except ImportError as e:
    print(f"[Warning] Speaker diarization not available: {e}")

# AI 文本优化是可选的
AI_REFINE_AVAILABLE = False
try:
    from postprocess.ai_refiner import AIRefiner
    AI_REFINE_AVAILABLE = True
except ImportError as e:
    print(f"[Warning] AI refiner not available: {e}")


# Global instances
engines = {}
engines_lock = asyncio.Lock()
diarizer: Optional[object] = None
MOCK_MODE = False
CURRENT_SPEAKER_MODEL = normalize_speaker_model_name(
    os.environ.get("VOICESCRIBE_SPK_MODEL", "cam++")
)


_FUNASR_TIMESTAMP_CAPABLE_MODELS = {
    "paraformer-zh",
    "seaco-paraformer",
}


def _resolve_funasr_internal_diarization(
    enable_diarization: bool,
    speaker_model: str,
    model_name: str | None = None,
) -> tuple[bool, str | None]:
    """FunASR internal spk_model currently only supports cam++ reliably.

    Other speaker models remain available for streaming/offline speaker mapping
    via the independent speaker tracker, but should not be passed into
    FunASR's internal diarization loader.
    """
    selected = normalize_speaker_model_name(speaker_model)
    if not enable_diarization:
        return False, None
    if model_name and model_name not in _FUNASR_TIMESTAMP_CAPABLE_MODELS:
        return False, None
    if selected == "cam++":
        return True, selected
    return False, None
os.environ["VOICESCRIBE_SPK_MODEL"] = CURRENT_SPEAKER_MODEL


def _new_speaker_diarizer() -> "SpeakerDiarizer":
    return SpeakerDiarizer(sv_model_name=CURRENT_SPEAKER_MODEL)

# 预加载配置：默认禁用，避免阻塞服务启动
# 若需要启动时预加载，设置环境变量 VOICESCRIBE_PRELOAD_MODELS=1
PRELOAD_CONFIG = {
    "funasr": "seaco-paraformer",
}
ENABLE_PRELOAD = os.environ.get("VOICESCRIBE_PRELOAD_MODELS") == "1"


async def _preload_models_on_startup():
    """启动时预加载模型，避免首次转录等待"""
    _scan_and_register_existing_models()

    if MOCK_MODE:
        print("[Preload] Mock mode, skipping preload")
        return
    if not ENABLE_PRELOAD:
        print("[Preload] Disabled, skipping preload")
        return

    for engine_name, model_name in PRELOAD_CONFIG.items():
        try:
            if engine_name == "funasr" and FUNASR_AVAILABLE:
                print(f"[Preload] Loading FunASR model: {model_name}...")
                eng = FunASREngine()
                eng.load(model_name)
                engines["funasr"] = {"engine": eng, "model": model_name}
                print(f"[Preload] FunASR ready!")
            elif engine_name == "whisper" and WHISPER_AVAILABLE:
                print(f"[Preload] Loading Whisper model: {model_name}...")
                eng = WhisperEngine()
                eng.load(model_name)
                engines["whisper"] = {"engine": eng, "model": model_name}
                print(f"[Preload] Whisper ready!")
        except Exception as e:
            print(f"[Preload] Failed to load {engine_name}: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await _preload_models_on_startup()
    yield


app = FastAPI(title="VoiceScribe", version="0.1.0", lifespan=lifespan)

# CORS for local app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TranscribeRequest(BaseModel):
    engine: str = "whisper"
    model: str = "large-v3"
    language: str = "zh"
    enable_diarization: bool = False
    speaker_names: Optional[dict] = None


class TranscribeResult(BaseModel):
    text: str
    segments: List[dict]
    duration: float
    engine: str
    model: str


class EngineInfo(BaseModel):
    name: str
    models: List[str]
    loaded_model: Optional[str]
    available: bool
    requires_gpu: bool = False  # 是否需要 GPU 支持


class ModelStatus(BaseModel):
    engine: str
    model: str
    available: bool
    downloading: bool
    size_bytes: Optional[int] = None
    downloaded_bytes: Optional[int] = None
    error: Optional[str] = None


@app.get("/")
async def root():
    return {
        "status": "ok",
        "service": "VoiceScribe",
        "mode": "mock" if MOCK_MODE else "production",
        "engines": {
            "whisper": WHISPER_AVAILABLE,
            "whispercpp": WHISPERCPP_AVAILABLE,
            "funasr": FUNASR_AVAILABLE,
            "parakeet": PARAKEET_AVAILABLE,
            "firered": FIRERED_AVAILABLE,
            "qwen3asr": QWEN3_ASR_AVAILABLE,
            "firered2": FIRERED2_AVAILABLE,
            "diarization": DIARIZATION_AVAILABLE,
            "ai_refine": AI_REFINE_AVAILABLE,
        },
        "streaming": True,
    }


@app.get("/engines")
async def list_engines() -> List[EngineInfo]:
    """列出可用的 ASR 引擎"""
    available = [
        EngineInfo(
            name="whisper",
            models=WHISPER_MODELS,
            loaded_model=engines.get("whisper", {}).get("model"),
            available=WHISPER_AVAILABLE,
            requires_gpu=False,  # 支持 CPU 和 GPU
        ),
        EngineInfo(
            name="whispercpp",
            models=WHISPERCPP_MODELS,
            loaded_model=engines.get("whispercpp", {}).get("model"),
            available=WHISPERCPP_AVAILABLE,
            requires_gpu=False,  # 支持 CPU 和 GPU
        ),
        EngineInfo(
            name="funasr",
            models=FUNASR_MODELS,
            loaded_model=engines.get("funasr", {}).get("model"),
            available=FUNASR_AVAILABLE,
            requires_gpu=False,  # 支持 CPU 和 GPU
        ),
        EngineInfo(
            name="parakeet",
            models=PARAKEET_MODELS,
            loaded_model=engines.get("parakeet", {}).get("model"),
            available=PARAKEET_AVAILABLE,
            requires_gpu=True,
        ),
        EngineInfo(
            name="firered",
            models=FIRERED_MODELS,
            loaded_model=engines.get("firered", {}).get("model"),
            available=FIRERED_AVAILABLE,
            requires_gpu=False,
        ),
        EngineInfo(
            name="qwen3asr",
            models=QWEN3_ASR_MODELS,
            loaded_model=engines.get("qwen3asr", {}).get("model"),
            available=QWEN3_ASR_AVAILABLE,
            requires_gpu=True,
        ),
        EngineInfo(
            name="firered2",
            models=FIRERED2_MODELS,
            loaded_model=engines.get("firered2", {}).get("model"),
            available=FIRERED2_AVAILABLE,
            requires_gpu=True,
        ),
    ]
    return available


def _get_model_status(engine: str, model: str) -> ModelStatus:
    key = f"{engine}:{model}"
    download_state = model_downloads.get(key, {})

    entry = _get_registry_entry(engine, model)
    available = False
    size_bytes = None

    if entry and _is_model_path_complete(engine, entry.get("path", "")):
        available = True
        size_bytes = entry.get("size_bytes")
    elif entry:
        _delete_registry_entry(engine, model)

    return ModelStatus(
        engine=engine,
        model=model,
        available=available,
        downloading=bool(download_state.get("downloading")),
        size_bytes=size_bytes,
        downloaded_bytes=download_state.get("downloaded_bytes"),
        error=download_state.get("error"),
    )


async def _download_funasr_model(model_name: str) -> tuple[str, int]:
    model_id = _get_fun_asr_model_id(model_name)
    if not model_id:
        raise ValueError(f"Unknown FunASR model: {model_name}")
    if not _module_available("modelscope"):
        raise RuntimeError("modelscope not available")

    from modelscope.hub.snapshot_download import snapshot_download

    local_dir = await asyncio.to_thread(
        snapshot_download, model_id, cache_dir=MODEL_CACHE_DIR
    )
    return local_dir, _dir_size(local_dir)


async def _download_whisper_model(model_name: str) -> tuple[str, int]:
    repo_id = WHISPER_HF_REPOS.get(model_name)
    if not repo_id:
        raise ValueError(f"Unknown Whisper model: {model_name}")

    from huggingface_hub import snapshot_download

    local_dir = await asyncio.to_thread(
        snapshot_download, repo_id=repo_id, cache_dir=os.path.join(MODEL_CACHE_DIR, "huggingface")
    )
    return local_dir, _dir_size(local_dir)


async def _download_whispercpp_model(model_name: str) -> tuple[str, int]:
    if model_name not in WHISPERCPP_MODELS:
        raise ValueError(f"Unknown Whisper.cpp model: {model_name}")

    from huggingface_hub import hf_hub_download

    local_dir = os.path.join(MODEL_CACHE_DIR, "whispercpp")
    os.makedirs(local_dir, exist_ok=True)
    filename = f"ggml-{model_name}.bin"
    local_file = await asyncio.to_thread(
        hf_hub_download,
        repo_id=WHISPERCPP_HF_REPO,
        filename=filename,
        local_dir=local_dir,
        local_dir_use_symlinks=False,
    )
    return local_file, os.path.getsize(local_file)


async def _download_parakeet_model(model_name: str) -> tuple[str, int]:
    repo_id = PARAKEET_HF_REPOS.get(model_name)
    if not repo_id:
        raise ValueError(f"Unknown Parakeet model: {model_name}")

    from huggingface_hub import snapshot_download

    local_dir = await asyncio.to_thread(
        snapshot_download, repo_id=repo_id, cache_dir=os.path.join(MODEL_CACHE_DIR, "huggingface")
    )
    return local_dir, _dir_size(local_dir)


async def _download_firered_model(model_name: str) -> tuple[str, int]:
    repo_id = FIRERED_HF_REPOS.get(model_name)
    if not repo_id:
        raise ValueError(f"Unknown FireRedASR model: {model_name}")

    from huggingface_hub import snapshot_download

    local_dir = await asyncio.to_thread(
        snapshot_download, repo_id=repo_id, cache_dir=os.path.join(MODEL_CACHE_DIR, "huggingface")
    )
    return local_dir, _dir_size(local_dir)


async def _download_qwen3_asr_model(model_name: str) -> tuple[str, int]:
    repo_id = QWEN3_ASR_HF_REPOS.get(model_name)
    if not repo_id:
        raise ValueError(f"Unknown Qwen3-ASR model: {model_name}")

    from huggingface_hub import snapshot_download

    local_dir = await asyncio.to_thread(
        snapshot_download,
        repo_id=repo_id,
        cache_dir=os.path.join(MODEL_CACHE_DIR, "huggingface"),
    )
    return local_dir, _dir_size(local_dir)


async def _download_firered2_model(model_name: str) -> tuple[str, int]:
    repo_id = FIRERED2_HF_REPOS.get(model_name)
    if not repo_id:
        raise ValueError(f"Unknown FireRedASR2 model: {model_name}")

    from huggingface_hub import snapshot_download

    local_dir = await asyncio.to_thread(
        snapshot_download,
        repo_id=repo_id,
        cache_dir=os.path.join(MODEL_CACHE_DIR, "huggingface"),
    )
    return local_dir, _dir_size(local_dir)


async def _download_speaker_model(model_name: str) -> tuple[str, int]:
    if model_name not in SPEAKER_MODELS:
        raise ValueError(f"Unknown speaker model: {model_name}")
    if not _module_available("modelscope"):
        raise RuntimeError("modelscope not available")

    from modelscope.hub.snapshot_download import snapshot_download

    last_error = None
    for model_id in get_speaker_model_candidates(model_name):
        try:
            local_dir = await asyncio.to_thread(
                snapshot_download, model_id, cache_dir=MODEL_CACHE_DIR
            )
            return local_dir, _dir_size(local_dir)
        except Exception as e:
            last_error = e
            continue

    raise RuntimeError(
        f"Failed to download speaker model '{model_name}': {last_error}"
    )


def _all_managed_models() -> dict:
    return {
        "whisper": WHISPER_MODELS,
        "whispercpp": WHISPERCPP_MODELS,
        "funasr": FUNASR_MODELS,
        "parakeet": PARAKEET_MODELS,
        "firered": FIRERED_MODELS,
        "qwen3asr": QWEN3_ASR_MODELS,
        "firered2": FIRERED2_MODELS,
        "speaker": SPEAKER_MODELS,
    }


async def _download_model_with_progress(engine: str, model: str) -> None:
    key = f"{engine}:{model}"
    state = model_downloads.setdefault(key, {})
    state["downloading"] = True
    state["error"] = None
    state["downloaded_bytes"] = 0

    baseline = _cache_total_size()
    stop_event = asyncio.Event()

    async def monitor_cache():
        while not stop_event.is_set():
            try:
                current = _cache_total_size()
                state["downloaded_bytes"] = max(0, current - baseline)
            except Exception:
                pass
            await asyncio.sleep(1.0)

    monitor_task = asyncio.create_task(monitor_cache())

    try:
        if engine == "funasr":
            local_path, size_bytes = await _download_funasr_model(model)
        elif engine == "whisper":
            local_path, size_bytes = await _download_whisper_model(model)
        elif engine == "whispercpp":
            local_path, size_bytes = await _download_whispercpp_model(model)
        elif engine == "parakeet":
            local_path, size_bytes = await _download_parakeet_model(model)
        elif engine == "firered":
            local_path, size_bytes = await _download_firered_model(model)
        elif engine == "qwen3asr":
            local_path, size_bytes = await _download_qwen3_asr_model(model)
        elif engine == "firered2":
            local_path, size_bytes = await _download_firered2_model(model)
        elif engine == "speaker":
            local_path, size_bytes = await _download_speaker_model(model)
        else:
            raise ValueError(f"Unsupported engine: {engine}")

        _set_registry_entry(engine, model, local_path, size_bytes)
        state["size_bytes"] = size_bytes
    except Exception as e:
        state["error"] = str(e)
    finally:
        stop_event.set()
        try:
            await monitor_task
        except Exception:
            pass
        state["downloading"] = False


@app.get("/models")
async def list_models() -> List[ModelStatus]:
    """List all managed models and their download status."""
    models = []
    for engine_name, model_names in _all_managed_models().items():
        for model_name in model_names:
            models.append(_get_model_status(engine_name, model_name))
    return models


@app.post("/models/download")
async def download_model(engine: str = Form(...), model: str = Form(...)):
    if engine not in _all_managed_models():
        raise HTTPException(400, f"Unsupported engine: {engine}")
    if model not in _all_managed_models()[engine]:
        raise HTTPException(400, f"Unknown model for {engine}: {model}")

    status = _get_model_status(engine, model)
    if status.available or status.downloading:
        return {"status": "already", "engine": engine, "model": model}

    asyncio.create_task(_download_model_with_progress(engine, model))
    return {"status": "started", "engine": engine, "model": model}


@app.post("/models/delete")
async def delete_model(engine: str = Form(...), model: str = Form(...)):
    if engine not in _all_managed_models():
        raise HTTPException(400, f"Unsupported engine: {engine}")
    if model not in _all_managed_models()[engine]:
        raise HTTPException(400, f"Unknown model for {engine}: {model}")

    key = f"{engine}:{model}"
    entry = _get_registry_entry(engine, model)
    if entry:
        _delete_managed_model_files(engine, entry.get("path", ""))
    _delete_registry_entry(engine, model)
    model_downloads.pop(key, None)
    return {"status": "deleted", "engine": engine, "model": model}


@app.post("/load")
async def load_engine(
    engine: Optional[str] = Form(None),
    model: Optional[str] = Form(None),
    enable_diarization: Optional[bool] = Form(None),
    speaker_model: Optional[str] = Form(None),
    request: Request = None,
):
    if engine is None or model is None:
        if request is not None:
            engine = engine or request.query_params.get("engine")
            model = model or request.query_params.get("model")
            if speaker_model is None:
                speaker_model = request.query_params.get("speaker_model")
    if engine is None or model is None:
        raise HTTPException(422, "Missing engine/model")
    """预加载指定引擎和模型"""
    global engines

    # Validate engine/model names
    all_models = _all_managed_models()
    if engine not in all_models:
        raise HTTPException(400, f"Unknown engine: {engine}")
    if model not in all_models[engine]:
        raise HTTPException(400, f"Unknown model '{model}' for engine '{engine}'")

    if MOCK_MODE:
        engines[engine] = {"engine": None, "model": model}
        return {"status": "loaded (mock)", "engine": engine, "model": model}

    existing_engine = engines.get(engine)
    if existing_engine and existing_engine.get("engine") is not None and existing_engine.get("model") == model:
        return {"status": "already_loaded", "engine": engine, "model": model}
    
    if engine == "whisper":
        if not WHISPER_AVAILABLE:
            raise HTTPException(400, "Whisper engine not available. Install faster-whisper.")
        eng = WhisperEngine()
        eng.load(model)
        engines["whisper"] = {"engine": eng, "model": model}
    elif engine == "whispercpp":
        if not WHISPERCPP_AVAILABLE:
            raise HTTPException(400, "Whisper.cpp engine not available. Install whisper-cpp via brew.")
        entry = _get_registry_entry("whispercpp", model)
        model_path = None
        if entry:
            candidate = entry.get("path")
            if candidate and os.path.exists(candidate):
                model_path = candidate
        if not model_path:
            model_path = os.path.expanduser(f"~/.whisper-models/ggml-{model}.bin")
        eng = WhisperCppEngine(model_path=model_path)
        engines["whispercpp"] = {"engine": eng, "model": model}
    elif engine == "funasr":
        if not FUNASR_AVAILABLE:
            raise HTTPException(400, "FunASR engine not available. Install funasr.")
        eng = FunASREngine()
        selected_speaker_model = normalize_speaker_model_name(
            speaker_model or CURRENT_SPEAKER_MODEL
        )
        internal_diarization, internal_speaker_model = _resolve_funasr_internal_diarization(
            bool(enable_diarization),
            selected_speaker_model,
            model,
        )
        eng.load(
            model,
            enable_diarization=internal_diarization,
            speaker_model_name=internal_speaker_model or "cam++",
        )
        engines["funasr"] = {
            "engine": eng,
            "model": model,
            "diarization": internal_diarization,
            "speaker_model": selected_speaker_model,
            "internal_speaker_model": internal_speaker_model,
        }
    elif engine == "parakeet":
        if not PARAKEET_AVAILABLE:
            raise HTTPException(400, "Parakeet engine not available. Requires NVIDIA GPU and NeMo toolkit.")
        eng = ParakeetEngine()
        eng.load(model)
        engines["parakeet"] = {"engine": eng, "model": model}
    elif engine == "firered":
        if not FIRERED_AVAILABLE:
            raise HTTPException(400, "FireRedASR engine not available. Install: pip install git+https://github.com/FireRedTeam/FireRedASR.git")
        entry = _get_registry_entry("firered", model)
        local_model_path = entry.get("path") if entry else None
        eng = FireRedEngine()
        eng.load(model, local_model_path=local_model_path)
        engines["firered"] = {"engine": eng, "model": model}
    elif engine == "qwen3asr":
        if not QWEN3_ASR_AVAILABLE:
            raise HTTPException(400, "Qwen3-ASR engine not available. Install qwen-asr.")
        entry = _get_registry_entry("qwen3asr", model)
        local_model_path = entry.get("path") if entry else None
        eng = Qwen3ASREngine()
        eng.load(model, local_model_path=local_model_path)
        engines["qwen3asr"] = {"engine": eng, "model": model}
    elif engine == "firered2":
        if not FIRERED2_AVAILABLE:
            raise HTTPException(400, "FireRedASR2 engine not available. Install fireredasr.")
        entry = _get_registry_entry("firered2", model)
        local_model_path = entry.get("path") if entry else None
        eng = FireRed2Engine()
        eng.load(model, local_model_path=local_model_path)
        engines["firered2"] = {"engine": eng, "model": model}
    else:
        raise HTTPException(400, f"Unknown engine: {engine}")
    
    return {"status": "loaded", "engine": engine, "model": model}


def mock_transcribe(audio_path: str, language: str = "zh") -> dict:
    """Mock 转录结果，用于前端开发测试"""
    import time

    # 模拟处理时间（增加延迟以便看到 thinking 状态）
    time.sleep(2.0)

    # 返回示例结果
    mock_text = "这是一段模拟的语音转文字结果。VoiceScribe 正在开发中，ASR 引擎尚未加载。"
    if language == "en":
        mock_text = "This is a mock transcription result. VoiceScribe is in development mode."
    
    return {
        "text": mock_text,
        "segments": [
            {"start": 0.0, "end": 2.5, "text": mock_text[:20]},
            {"start": 2.5, "end": 5.0, "text": mock_text[20:]},
        ],
        "duration": 5.0,
        "language": language,
    }


def apply_unified_speaker_system(
    result: dict,
    *,
    engine: str,
    enable_diarization: bool,
    audio_path: str,
    source: str,
) -> dict:
    """Apply the shared offline speaker pipeline."""
    global diarizer, engines

    if not enable_diarization:
        logger.info("[Speaker] %s: diarization disabled, skipping speaker pipeline", source)
        return result

    diarization_done = False

    if (
        DIARIZATION_AVAILABLE
        and engine == "funasr"
        and engines.get("funasr", {}).get("diarization", False)
    ):
        try:
            diarization_list = [
                {
                    "start": seg["start"],
                    "end": seg["end"],
                    "speaker": seg.get("speaker"),
                }
                for seg in result.get("segments", [])
                if seg.get("speaker") is not None
            ]
            if diarization_list:
                logger.info(
                    "[Speaker] %s: using FunASR internal diarization (%s speaker-tagged segments)",
                    source,
                    len(diarization_list),
                )
                diarization_done = True
                if diarizer is None:
                    diarizer = _new_speaker_diarizer()
                if diarizer.speakers and diarizer.sv_model is None:
                    diarizer.load(load_diarization=False)
                result = diarizer.assign_speakers(
                    result,
                    diarization_list,
                    audio_path=audio_path,
                )
            else:
                logger.info(
                    "[Speaker] %s: FunASR internal diarization returned no speaker segments, falling back to offline diarizer",
                    source,
                )
        except Exception as exc:
            logger.warning("[Speaker] %s name mapping failed: %s", source, exc)

    if DIARIZATION_AVAILABLE and not diarization_done:
        try:
            logger.info("[Speaker] %s: running offline diarization fallback", source)
            if diarizer is None:
                diarizer = _new_speaker_diarizer()
                diarizer.load()
            elif diarizer.diarization_model is None:
                diarizer.load()
            elif diarizer.sv_model is None and diarizer.speakers:
                diarizer.load(load_diarization=False)

            speakers = diarizer.diarize(audio_path)
            result = diarizer.assign_speakers(
                result,
                speakers,
                audio_path=audio_path,
            )
        except Exception as exc:
            logger.warning("[Speaker] %s diarization failed: %s", source, exc)
    elif diarization_done:
        logger.info("[Speaker] %s: offline diarization fallback skipped", source)

    return result


def _normalize_audio_upload(tmp_path: str) -> tuple[str, Optional[str], dict]:
    """Normalize uploaded audio to mono 16k PCM WAV when needed."""
    suffix = Path(tmp_path).suffix.lower()
    if suffix == ".wav":
        return tmp_path, None, {"audio_normalized": False}

    try:
        import torch
        import torchaudio

        waveform, sample_rate = torchaudio.load(tmp_path)
        original_channels = int(waveform.shape[0]) if waveform.ndim > 1 else 1
        if waveform.ndim == 1:
            waveform = waveform.unsqueeze(0)
        if waveform.shape[0] > 1:
            waveform = waveform.mean(dim=0, keepdim=True)
        if sample_rate != 16000:
            waveform = torchaudio.functional.resample(waveform, sample_rate, 16000)
            sample_rate = 16000

        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as handle:
            normalized_path = handle.name

        torchaudio.save(
            normalized_path,
            waveform.to(torch.float32),
            sample_rate,
            encoding="PCM_S",
            bits_per_sample=16,
        )
        duration = float(waveform.shape[-1] / sample_rate) if sample_rate else 0.0
        return normalized_path, normalized_path, {
            "audio_normalized": True,
            "source_audio_path": tmp_path,
            "normalized_audio_path": normalized_path,
            "normalized_audio_sample_rate": sample_rate,
            "normalized_audio_channels": 1,
            "source_audio_channels": original_channels,
            "normalized_audio_duration_s": round(duration, 3),
        }
    except Exception as exc:
        return tmp_path, None, {
            "audio_normalized": False,
            "audio_normalize_error": str(exc),
        }


@app.post("/transcribe")
async def transcribe(
    request: Request,
    audio: UploadFile = File(...),
    engine: str = Form("whisper"),
    model: str = Form("large-v3"),
    language: str = Form("zh"),
    enable_diarization: bool = Form(False),
    speaker_model: str = Form(""),
    hotwords: str = Form(""),
    enable_ai_refine: bool = Form(False),
) -> TranscribeResult:
    """转录音频文件"""
    global engines, diarizer
    
    request_started = time.perf_counter()
    stage = "save_upload"
    tmp_path: Optional[str] = None
    normalized_tmp_path: Optional[str] = None
    working_audio_path: Optional[str] = None
    audio_probe: dict = {}
    recording_session_id = request.headers.get("x-recording-session-id")
    transcribe_request_id = (
        request.headers.get("x-transcribe-request-id") or generate_id("req")
    )
    hotword_count = len([word.strip() for word in hotwords.split(",") if word.strip()])
    selected_speaker_model = normalize_speaker_model_name(
        speaker_model or CURRENT_SPEAKER_MODEL
    )
    internal_diarization, internal_speaker_model = _resolve_funasr_internal_diarization(
        bool(enable_diarization),
        selected_speaker_model,
        model if engine == "funasr" else None,
    )

    emit_event(
        "backend.transcribe",
        "transcribe_request_started",
        logger_name="server",
        recording_session_id=recording_session_id,
        transcribe_request_id=transcribe_request_id,
        filename=audio.filename,
        content_type=audio.content_type,
        engine=engine,
        model=model,
        language=language,
        enable_diarization=enable_diarization,
        speaker_model=selected_speaker_model,
        enable_ai_refine=enable_ai_refine,
        hotword_count=hotword_count,
    )
    
    try:
        # Mock 模式
        suffix = Path(audio.filename or "").suffix or ".wav"
        content = await audio.read()
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        emit_event(
            "backend.transcribe",
            "temp_audio_written",
            logger_name="server",
            recording_session_id=recording_session_id,
            transcribe_request_id=transcribe_request_id,
            audio_path=tmp_path,
            audio_size_bytes=len(content),
            audio_suffix=suffix,
        )

        stage = "normalize_audio"
        working_audio_path, normalized_tmp_path, normalization_info = _normalize_audio_upload(
            tmp_path
        )
        emit_event(
            "backend.transcribe",
            "audio_normalized",
            logger_name="server",
            recording_session_id=recording_session_id,
            transcribe_request_id=transcribe_request_id,
            **normalization_info,
        )

        stage = "probe_audio"
        audio_probe = probe_audio_file(working_audio_path)
        emit_event(
            "backend.transcribe",
            "uploaded_audio_probed",
            logger_name="server",
            recording_session_id=recording_session_id,
            transcribe_request_id=transcribe_request_id,
            **audio_probe,
        )

        if len(content) == 0:
            raise HTTPException(400, "Empty audio upload")
        if not audio_probe.get("audio_probe_ok", False):
            raise HTTPException(400, "Invalid or unsupported audio file")
        if float(audio_probe.get("audio_duration_s", 0) or 0) <= 0:
            raise HTTPException(400, "Audio duration is zero")
        if (
            bool(audio_probe.get("audio_is_silent", False))
            and float(audio_probe.get("audio_duration_s", 0) or 0) >= 1.0
        ):
            raise HTTPException(422, "No speech detected in audio")

        if MOCK_MODE:
            stage = "mock_transcribe"
            result = mock_transcribe(working_audio_path, language)
            # AI 文本优化（mock 模式也支持）
            if enable_ai_refine and AI_REFINE_AVAILABLE:
                refiner = AIRefiner()
                hotwords_list = [w.strip() for w in hotwords.split(",") if w.strip()]
                result["text"] = refiner.refine_sync(result["text"], hotwords_list)
            emit_event(
                "backend.transcribe",
                "transcribe_response_sent",
                logger_name="server",
                recording_session_id=recording_session_id,
                transcribe_request_id=transcribe_request_id,
                engine=f"{engine} (mock)",
                model=model,
                segment_count=len(result.get("segments", [])),
                result_duration_s=result.get("duration", 0),
                elapsed_ms=int((time.perf_counter() - request_started) * 1000),
            )
            return TranscribeResult(
                text=result["text"],
                segments=result.get("segments", []),
                duration=result.get("duration", 0),
                engine=f"{engine} (mock)",
                model=model,
            )
        
        # 检查引擎是否可用
        if engine == "whisper" and not WHISPER_AVAILABLE:
            raise HTTPException(400, "Whisper engine not available")
        if engine == "whispercpp" and not WHISPERCPP_AVAILABLE:
            raise HTTPException(400, "Whisper.cpp engine not available")
        if engine == "funasr" and not FUNASR_AVAILABLE:
            raise HTTPException(400, "FunASR engine not available")
        if engine == "parakeet" and not PARAKEET_AVAILABLE:
            raise HTTPException(400, "Parakeet engine not available")
        if engine == "firered" and not FIRERED_AVAILABLE:
            raise HTTPException(400, "FireRedASR engine not available")
        if engine == "qwen3asr" and not QWEN3_ASR_AVAILABLE:
            raise HTTPException(400, "Qwen3-ASR engine not available")
        if engine == "firered2" and not FIRERED2_AVAILABLE:
            raise HTTPException(400, "FireRedASR2 engine not available")
        
        # Get or create engine
        engine_action = "reused"
        if engine not in engines or engines[engine]["model"] != model:
            stage = "load_engine"
            await load_engine(
                engine,
                model,
                enable_diarization=internal_diarization if engine == "funasr" else None,
                speaker_model=selected_speaker_model if engine == "funasr" else None,
            )
            engine_action = "loaded"
        elif engine == "funasr":
            # 如果需要说话人识别但当前引擎未开启，则重新加载
            funasr_state = engines.get("funasr", {})
            if (
                funasr_state.get("diarization", False) != internal_diarization
                or funasr_state.get("speaker_model") != selected_speaker_model
                or funasr_state.get("internal_speaker_model") != internal_speaker_model
            ):
                stage = "load_engine"
                await load_engine(
                    engine,
                    model,
                    enable_diarization=internal_diarization,
                    speaker_model=selected_speaker_model,
                )
                engine_action = (
                    "loaded_with_diarization"
                    if internal_diarization
                    else "loaded_without_internal_diarization"
                )
        
        emit_event(
            "backend.transcribe",
            "engine_loaded_or_reused",
            logger_name="server",
            recording_session_id=recording_session_id,
            transcribe_request_id=transcribe_request_id,
            engine=engine,
            model=model,
            engine_action=engine_action,
        )

        eng = engines[engine]["engine"]

        # Transcribe (pass hotwords for FunASR)
        stage = "engine_transcribe"
        emit_event(
            "backend.transcribe",
            "engine_transcribe_started",
            logger_name="server",
            recording_session_id=recording_session_id,
            transcribe_request_id=transcribe_request_id,
            engine=engine,
            model=model,
            hotword_count=hotword_count,
        )
        if engine == "funasr" and hotwords:
            print(f"[Transcribe] FunASR with hotwords: {hotwords}")
            result = eng.transcribe(working_audio_path, language=language, hotwords=hotwords)
        else:
            print(f"[Transcribe] Engine={engine}, hotwords={hotwords or '(none)'}")
            result = eng.transcribe(working_audio_path, language=language)
        
        # Speaker diarization if enabled (FunASR 内置 spk_model 时可跳过)
        emit_event(
            "backend.transcribe",
            "engine_transcribe_finished",
            logger_name="server",
            recording_session_id=recording_session_id,
            transcribe_request_id=transcribe_request_id,
            engine=engine,
            model=model,
            segment_count=len(result.get("segments", [])),
            result_duration_s=result.get("duration", 0),
        )
        stage = "speaker_diarization"
        result = apply_unified_speaker_system(
            result,
            engine=engine,
            enable_diarization=enable_diarization,
            audio_path=working_audio_path,
            source="transcribe",
        )
        if False and engine == "funasr" and internal_diarization:
            if engines.get("funasr", {}).get("diarization", False):
                # 如果 FunASR 已给出 speaker 标签，尝试将标签映射为已注册说话人姓名
                try:
                    stage = "speaker_diarization"
                    diarization_list = [
                        {
                            "start": seg["start"],
                            "end": seg["end"],
                            "speaker": seg.get("speaker"),
                        }
                        for seg in result.get("segments", [])
                        if seg.get("speaker") is not None
                    ]
                    if diarization_list:
                        diarization_done = True
                        if diarizer is None:
                            diarizer = _new_speaker_diarizer()
                        if diarizer.speakers and diarizer.sv_model is None:
                            diarizer.load(load_diarization=False)
                        result = diarizer.assign_speakers(
                            result,
                            diarization_list,
                            audio_path=working_audio_path,
                        )
                except Exception as e:
                    print(f"[Speaker] Name mapping failed: {e}")

        if False and enable_diarization and DIARIZATION_AVAILABLE and not diarization_done:
            if diarizer is None:
                diarizer = _new_speaker_diarizer()
                diarizer.load()
            elif diarizer.diarization_model is None:
                diarizer.load()
            elif diarizer.sv_model is None and diarizer.speakers:
                diarizer.load(load_diarization=False)

            speakers = diarizer.diarize(working_audio_path)
            result = diarizer.assign_speakers(
                result,
                speakers,
                audio_path=working_audio_path,
            )

        # AI 文本优化
        if enable_ai_refine and AI_REFINE_AVAILABLE:
            stage = "ai_refine"
            refiner = AIRefiner()
            hotwords_list = [w.strip() for w in hotwords.split(",") if w.strip()]
            print(f"[AI Refine] Hotwords: {hotwords_list}")
            print(f"[AI Refine] Original: {result['text'][:100]}...")
            result["text"] = refiner.refine_sync(result["text"], hotwords_list)
            print(f"[AI Refine] Refined: {result['text'][:100]}...")

        emit_event(
            "backend.transcribe",
            "transcribe_response_sent",
            logger_name="server",
            recording_session_id=recording_session_id,
            transcribe_request_id=transcribe_request_id,
            engine=engine,
            model=model,
            segment_count=len(result.get("segments", [])),
            result_duration_s=result.get("duration", 0),
            elapsed_ms=int((time.perf_counter() - request_started) * 1000),
        )
        return TranscribeResult(
            text=result["text"],
            segments=result.get("segments", []),
            duration=result.get("duration", 0),
            engine=engine,
            model=model,
        )

    except HTTPException as exc:
        emit_event(
            "backend.transcribe",
            "transcribe_failed",
            level="ERROR",
            logger_name="server",
            recording_session_id=recording_session_id,
            transcribe_request_id=transcribe_request_id,
            stage=stage,
            error_type=classify_http_error_detail(exc.detail),
            status_code=exc.status_code,
            error_message=exc.detail,
            elapsed_ms=int((time.perf_counter() - request_started) * 1000),
            **audio_probe,
        )
        raise
    except Exception as exc:
        logger.exception(
            "[Transcribe] request_id=%s stage=%s failed",
            transcribe_request_id,
            stage,
        )
        emit_event(
            "backend.transcribe",
            "transcribe_failed",
            level="ERROR",
            logger_name="server",
            recording_session_id=recording_session_id,
            transcribe_request_id=transcribe_request_id,
            stage=stage,
            error_type=classify_transcribe_error(stage, exc),
            exception_type=type(exc).__name__,
            error_message=str(exc),
            elapsed_ms=int((time.perf_counter() - request_started) * 1000),
            **audio_probe,
        )
        raise HTTPException(500, "Transcription failed") from exc
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)
        if (
            normalized_tmp_path
            and normalized_tmp_path != tmp_path
            and os.path.exists(normalized_tmp_path)
        ):
            os.unlink(normalized_tmp_path)


logger = logging.getLogger(__name__)


class _MockASREngine:
    """Mock ASR engine for testing without real models."""

    def transcribe_array(self, audio, sample_rate=16000, **kwargs):
        duration = len(audio) / sample_rate
        return {
            "text": f"[模拟转写 {duration:.1f}s]",
            "segments": [],
            "duration": 0.01,
            "language": "zh",
            "engine": "mock",
        }


@app.websocket("/stream")
async def stream_ws(websocket: WebSocket):
    """WebSocket endpoint for real-time streaming transcription with VAD,
    speaker diarization, and summarization.

    Protocol:
    Client sends: {"action": "start", "engine": "firered", "speakers_enabled": true}
    Client sends: binary PCM16 mono 16kHz audio data
    Client sends: {"action": "end"}

    Server sends: {"type": "utterance", "speaker": "...", "text": "...", ...}
    Server sends: {"type": "speaker_active", "speaker": "...", ...}
    Server sends: {"type": "summary", "content": "...", ...}
    Server sends: {"type": "session_end", ...}
    """
    from meeting.session import MeetingSession, SessionConfig
    from meeting.stream_commit_buffer import StreamingCommitBuffer

    async def _summary_loop(sess, ws):
        """Periodically generate summaries."""
        while True:
            await asyncio.sleep(sess.config.summary_interval)
            if sess.summarizer.should_summarize():
                result = await sess.summarizer.generate_summary()
                if result:
                    sess.running_summary = result.content
                    await ws.send_json(result.to_dict())

    async def _process_stream_segment(sess, segment):
        """Run ASR + speaker flow for one VAD segment and emit websocket events."""
        utterances = await sess.process_audio_segment(segment)
        for utterance in utterances:
            await websocket.send_json(utterance.to_dict())

            await websocket.send_json({
                "type": "speaker_active",
                "speaker": utterance.speaker,
                "speaker_id": utterance.speaker_id,
                "active_speakers": utterance.speakers,
            })

            if sess.config.enable_ai_summary:
                sess.summarizer.add_utterance(utterance)

            if sess.config.enable_ai_refine:
                refined = await sess.refine_utterance(utterance)
                if refined:
                    await websocket.send_json({
                        "type": "utterance_refined",
                        "utterance_id": utterance.id,
                        "text": refined,
                    })

    async def _process_commit_window(sess, commit_window):
        """Run ASR + speaker flow for one buffered commit window and emit websocket events."""
        utterances = await sess.process_commit_window(commit_window)
        for utterance in utterances:
            await websocket.send_json(utterance.to_dict())

            await websocket.send_json({
                "type": "speaker_active",
                "speaker": utterance.speaker,
                "speaker_id": utterance.speaker_id,
                "active_speakers": utterance.speakers,
            })

            if sess.config.enable_ai_summary:
                sess.summarizer.add_utterance(utterance)

            if sess.config.enable_ai_refine:
                refined = await sess.refine_utterance(utterance)
                if refined:
                    await websocket.send_json({
                        "type": "utterance_refined",
                        "utterance_id": utterance.id,
                        "text": refined,
                    })

    async def _emit_mock_stream_events(sess, audio_bytes, offset_s, flush=False):
        """Emit deterministic protocol events for MOCK_MODE without real VAD."""
        pending_bytes = getattr(sess, "_mock_stream_buffer", b"") + (audio_bytes or b"")
        if not pending_bytes:
            return offset_s

        aligned_len = len(pending_bytes) - (len(pending_bytes) % 2)
        aligned_bytes = pending_bytes[:aligned_len]
        remaining_bytes = pending_bytes[aligned_len:]
        min_emit_bytes = int(0.2 * 16000 * 2)

        if not flush and len(aligned_bytes) < min_emit_bytes:
            sess._mock_stream_buffer = pending_bytes
            return offset_s

        if not aligned_bytes:
            sess._mock_stream_buffer = remaining_bytes
            return offset_s

        sess._mock_stream_buffer = remaining_bytes
        audio = np.frombuffer(aligned_bytes, dtype=np.int16).astype(np.float32) / 32768.0
        if audio.size == 0:
            return offset_s

        duration = audio.size / 16000.0
        if duration <= 0:
            return offset_s

        result = sess.asr_engine.transcribe_array(
            audio,
            sample_rate=16000,
            hotwords=sess.config.hotwords,
        )
        primary_speaker = "Speaker"
        primary_speaker_id = "unknown"
        speaker_labels = [
            {
                "speaker": primary_speaker,
                "speaker_id": primary_speaker_id,
                "confidence": 0.0,
                "role": "primary",
            }
        ]
        utterance = sess._build_utterance(
            text=str(result.get("text", "")).strip() or "[mock utterance]",
            start=offset_s,
            end=offset_s + duration,
            speaker_name=primary_speaker,
            speaker_id=primary_speaker_id,
            confidence=0.0,
            speakers=speaker_labels,
            overlap_detected=False,
            overlap_score=0.0,
            speaker_spans=[
                {
                    "start": offset_s,
                    "end": offset_s + duration,
                    "speaker": primary_speaker,
                    "speaker_id": primary_speaker_id,
                    "confidence": 0.0,
                    "speakers": speaker_labels,
                    "overlap_detected": False,
                    "overlap_score": 0.0,
                }
            ],
        )
        sess.add_utterance(utterance)
        await websocket.send_json(utterance.to_dict())
        await websocket.send_json({
            "type": "speaker_active",
            "speaker": utterance.speaker,
            "speaker_id": utterance.speaker_id,
            "active_speakers": utterance.speakers,
        })

        if sess.config.enable_ai_refine:
            refined = await sess.refine_utterance(utterance)
            if refined:
                await websocket.send_json({
                    "type": "utterance_refined",
                    "utterance_id": utterance.id,
                    "text": refined,
                })

        return offset_s + duration

    await websocket.accept()
    session = None
    summary_task = None
    mock_stream_offset_s = 0.0
    commit_buffer = None

    try:
        while True:
            data = await websocket.receive()

            if "text" in data:
                try:
                    msg = json.loads(data["text"])
                except json.JSONDecodeError:
                    await websocket.send_json({
                        "type": "error",
                        "message": "invalid json",
                    })
                    if summary_task:
                        summary_task.cancel()
                        summary_task = None
                    if session:
                        session.cleanup()
                        session = None
                    break
                action = msg.get("action")

                if action == "start":
                    requested_vad_max_segment_s = float(msg.get("vad_max_segment_s", 30.0))
                    commit_min_window_s = float(msg.get("commit_min_window_s", 5.0))
                    commit_preferred_window_s = float(msg.get("commit_preferred_window_s", 6.0))
                    commit_max_window_s = float(msg.get("commit_max_window_s", 8.0))
                    commit_stable_silence_gap_s = float(
                        msg.get("commit_stable_silence_gap_s", 1.0)
                    )
                    config = SessionConfig(
                        engine=msg.get("engine", "funasr"),
                        model=msg.get("model", "seaco-paraformer"),
                        speakers_enabled=msg.get("speakers_enabled", True),
                        speaker_model=normalize_speaker_model_name(
                            msg.get("speaker_model") or CURRENT_SPEAKER_MODEL
                        ),
                        hotwords=msg.get("hotwords", ""),
                        enable_ai_refine=msg.get("enable_ai_refine", True),
                        enable_ai_summary=msg.get("enable_ai_summary", True),
                        summary_interval=msg.get("summary_interval", 120),
                        llm_provider=msg.get("llm_provider", "claude_cli"),
                        llm_model=msg.get("llm_model", "haiku"),
                        vad_threshold=float(msg.get("vad_threshold", 0.5)),
                        vad_min_speech_ms=int(msg.get("vad_min_speech_ms", 300)),
                        vad_hangover_ms=int(msg.get("vad_hangover_ms", 700)),
                        vad_pre_roll_ms=int(msg.get("vad_pre_roll_ms", 200)),
                        vad_max_segment_s=min(requested_vad_max_segment_s, commit_max_window_s),
                        speaker_match_threshold=float(msg.get("speaker_match_threshold", 0.6)),
                        active_registered_floor_min=float(
                            msg.get("active_registered_floor_min", 0.5)
                        ),
                        active_registered_floor_offset=float(
                            msg.get("active_registered_floor_offset", 0.1)
                        ),
                        active_registered_keep_margin=float(
                            msg.get("active_registered_keep_margin", 0.04)
                        ),
                        stable_registered_floor_offset=float(
                            msg.get("stable_registered_floor_offset", 0.08)
                        ),
                        stable_registered_keep_margin=float(
                            msg.get("stable_registered_keep_margin", 0.06)
                        ),
                        registered_switch_floor_min=float(
                            msg.get("registered_switch_floor_min", 0.52)
                        ),
                        registered_switch_floor_offset=float(
                            msg.get("registered_switch_floor_offset", 0.06)
                        ),
                        registered_switch_margin=float(
                            msg.get("registered_switch_margin", 0.05)
                        ),
                        span_continuity_floor_min=float(
                            msg.get("span_continuity_floor_min", 0.38)
                        ),
                        span_continuity_floor_offset=float(
                            msg.get("span_continuity_floor_offset", 0.12)
                        ),
                        span_continuity_keep_margin=float(
                            msg.get("span_continuity_keep_margin", 0.08)
                        ),
                        span_top_fallback_offset=float(
                            msg.get("span_top_fallback_offset", 0.05)
                        ),
                        pyannote_window_s=float(msg.get("pyannote_window_s", 1.2)),
                        pyannote_hop_s=float(msg.get("pyannote_hop_s", 0.6)),
                        pyannote_change_similarity=float(
                            msg.get("pyannote_change_similarity", 0.72)
                        ),
                        min_multi_speaker_span_s=float(
                            msg.get("min_multi_speaker_span_s", 0.8)
                        ),
                        noise_filter_enabled=bool(msg.get("noise_filter_enabled", True)),
                        noise_max_duration_s=float(msg.get("noise_max_duration_s", 0.35)),
                        noise_rms_threshold=float(msg.get("noise_rms_threshold", 0.012)),
                        noise_peak_threshold=float(msg.get("noise_peak_threshold", 0.04)),
                        commit_min_window_s=commit_min_window_s,
                        commit_preferred_window_s=commit_preferred_window_s,
                        commit_max_window_s=commit_max_window_s,
                        commit_stable_silence_gap_s=commit_stable_silence_gap_s,
                    )
                    session = MeetingSession(config)
                    commit_buffer = None if MOCK_MODE else StreamingCommitBuffer(
                        min_commit_window_s=config.commit_min_window_s,
                        preferred_commit_window_s=config.commit_preferred_window_s,
                        max_commit_window_s=config.commit_max_window_s,
                        stable_silence_gap_s=config.commit_stable_silence_gap_s,
                    )
                    internal_diarization, internal_speaker_model = _resolve_funasr_internal_diarization(
                        config.speakers_enabled,
                        config.speaker_model,
                        config.model if config.engine == "funasr" else None,
                    )

                    # Set ASR engine (auto-load if needed)
                    engine_name = config.engine
                    engine_state = engines.get(engine_name, {})
                    needs_reload = (
                        engine_name not in engines
                        or engine_state.get("model") != config.model
                    )
                    if (
                        not needs_reload
                        and engine_name == "funasr"
                        and (
                            engine_state.get("speaker_model") != config.speaker_model
                            or engine_state.get("diarization", False) != internal_diarization
                            or engine_state.get("internal_speaker_model") != internal_speaker_model
                        )
                    ):
                        needs_reload = True
                    if needs_reload:
                        if not MOCK_MODE:
                            try:
                                await load_engine(
                                    engine_name,
                                    config.model,
                                    enable_diarization=internal_diarization
                                    if engine_name == "funasr"
                                    else None,
                                    speaker_model=config.speaker_model
                                    if engine_name == "funasr"
                                    else None,
                                )
                            except Exception as e:
                                await websocket.send_json({
                                    "type": "error",
                                    "message": f"Failed to load engine '{engine_name}': {e}"
                                })
                                continue

                    if MOCK_MODE:
                        session.set_asr_engine(_MockASREngine())
                    elif engine_name in engines and engines[engine_name].get("engine"):
                        session.set_asr_engine(engines[engine_name]["engine"])
                    else:
                        await websocket.send_json({
                            "type": "error",
                            "message": f"Engine '{engine_name}' not available"
                        })
                        continue

                    # Preload speaker embedding model & load registered speakers
                    speaker_backend = None
                    speaker_count = 0
                    if config.speakers_enabled and session.speaker_tracker:
                        tracker = session.speaker_tracker
                        status = tracker.preload()
                        speaker_backend = status["backend"]

                        if not status["available"]:
                            logger.warning("[Stream] No speaker embedding model available")
                        elif DIARIZATION_AVAILABLE:
                            # Load registered speakers into streaming tracker
                            spk_source = diarizer
                            if spk_source is None:
                                try:
                                    spk_source = _new_speaker_diarizer()
                                except Exception as e:
                                    logger.warning(f"[Stream] Cannot init SpeakerDiarizer: {e}")
                            if spk_source:
                                try:
                                    for spk in spk_source.list_speakers():
                                        audio_path = spk_source.get_speaker_audio_path(spk["speaker_id"])
                                        if audio_path:
                                            if tracker.register_from_audio(
                                                name=spk["name"],
                                                speaker_id=spk["speaker_id"],
                                                audio_path=audio_path,
                                            ):
                                                speaker_count += 1
                                        else:
                                            # No audio file — cannot re-extract with streaming model
                                            logger.warning(
                                                f"[Stream] Speaker '{spk['name']}' has no audio file, "
                                                "please re-register to use in streaming mode"
                                            )
                                except Exception as e:
                                    logger.warning(f"[Stream] Failed to load speakers: {e}")

                    await websocket.send_json({
                        "type": "started",
                        "session_id": session.session_id,
                        "engine": config.engine,
                        "speaker_model": config.speaker_model,
                        "speakers_enabled": config.speakers_enabled,
                        "speaker_backend": speaker_backend,
                        "registered_speakers": speaker_count,
                    })

                    # Start background summary loop
                    if config.enable_ai_summary:
                        summary_task = asyncio.create_task(
                            _summary_loop(session, websocket)
                        )
                    else:
                        summary_task = None
                    mock_stream_offset_s = 0.0

                elif action == "end":
                    if summary_task:
                        summary_task.cancel()
                        summary_task = None
                    if session:
                        if MOCK_MODE:
                            mock_stream_offset_s = await _emit_mock_stream_events(
                                session,
                                b"",
                                mock_stream_offset_s,
                                flush=True,
                            )
                        else:
                            # Flush tail audio that has not yet reached hangover silence.
                            try:
                                tail_segment = session.vad.flush()
                                if tail_segment is not None:
                                    commit_window = commit_buffer.push(tail_segment) if commit_buffer else None
                                    if commit_window is not None:
                                        await _process_commit_window(session, commit_window)
                                if commit_buffer and commit_buffer.has_pending:
                                    tail_window = commit_buffer.flush()
                                    if tail_window is not None:
                                        await _process_commit_window(session, tail_window)
                            except Exception as e:
                                logger.warning(f"[Stream] Tail flush failed: {e}")

                        session_data = session.get_session_data()
                        await websocket.send_json({
                            "type": "session_end",
                            "total_utterances": len(session.utterances),
                            "duration": session_data["duration"],
                            "session_data": session_data,
                        })
                        session.cleanup()
                        session = None
                        mock_stream_offset_s = 0.0
                        commit_buffer = None
                    break

            elif "bytes" in data:
                # Binary PCM audio data
                if session is None:
                    continue

                if MOCK_MODE:
                    mock_stream_offset_s = await _emit_mock_stream_events(
                        session,
                        data["bytes"],
                        mock_stream_offset_s,
                    )
                    continue

                audio_bytes = data["bytes"]
                audio = np.frombuffer(audio_bytes, dtype=np.int16).astype(
                    np.float32
                ) / 32768.0

                # Feed audio to VAD in 512-sample chunks
                chunk_size = 512
                for i in range(0, len(audio), chunk_size):
                    chunk = audio[i:i + chunk_size]
                    if len(chunk) < chunk_size:
                        chunk = np.pad(chunk, (0, chunk_size - len(chunk)))

                    segment = session.vad.process_chunk(chunk)

                    if segment is not None:
                        # VAD detected end of utterance
                        try:
                            commit_window = commit_buffer.push(segment) if commit_buffer else None
                            if commit_window is not None:
                                await _process_commit_window(session, commit_window)
                        except Exception as e:
                            logger.error(f"[Stream] Processing error: {e}")
                            await websocket.send_json({
                                "type": "error",
                                "message": str(e),
                            })

    except WebSocketDisconnect:
        if summary_task:
            summary_task.cancel()
        if session:
            # Graceful degradation: try to send session_end before cleanup
            try:
                session_data = session.get_session_data()
                await websocket.send_json({
                    "type": "session_end",
                    "total_utterances": len(session.utterances),
                    "duration": session_data["duration"],
                    "session_data": session_data,
                })
            except Exception:
                pass
            session.cleanup()
            commit_buffer = None
    except Exception as e:
        logger.error(f"[Stream] WebSocket error: {e}")
        if summary_task:
            summary_task.cancel()
        if session:
            session.cleanup()
        commit_buffer = None


@app.post("/speakers/reload-models")
async def reload_speaker_models(
    preload: Optional[bool] = Form(None),
    speaker_model: Optional[str] = Form(None),
    request: Request = None,
):
    """Reload speaker recognition model backends.

    - Streaming tracker backends are re-evaluated (pyannote clustering -> CAM++ mapping).
    - Offline SpeakerDiarizer is preloaded whenever speaker diarization is enabled.
    """
    global diarizer, CURRENT_SPEAKER_MODEL

    def _parse_bool(v: Optional[str]) -> Optional[bool]:
        if v is None:
            return None
        s = str(v).strip().lower()
        if s in ("1", "true", "yes", "on"):
            return True
        if s in ("0", "false", "no", "off"):
            return False
        return None

    preload_flag = preload
    if preload_flag is None and request is not None:
        preload_flag = _parse_bool(request.query_params.get("preload"))
    preload_flag = bool(preload_flag)

    selected_model = speaker_model
    if selected_model is None and request is not None:
        selected_model = request.query_params.get("speaker_model")
    if selected_model is not None:
        CURRENT_SPEAKER_MODEL = normalize_speaker_model_name(selected_model)
    os.environ["VOICESCRIBE_SPK_MODEL"] = CURRENT_SPEAKER_MODEL

    tracker_status = {"backend": None, "available": False}
    tracker_error = None
    try:
        from meeting.speaker_tracker import build_speaker_backend_plan, reload_speaker_tracker

        enable_streaming = None
        enable_diarization = None
        if request is not None:
            enable_streaming = _parse_bool(request.query_params.get("enable_streaming"))
            enable_diarization = _parse_bool(request.query_params.get("enable_diarization"))

        if enable_streaming is None and enable_diarization is None:
            plan = build_speaker_backend_plan(
                enable_streaming=preload_flag,
                enable_diarization=preload_flag,
                sv_model_name=CURRENT_SPEAKER_MODEL,
            )
        else:
            plan = build_speaker_backend_plan(
                enable_streaming=bool(enable_streaming),
                enable_diarization=bool(enable_diarization),
                sv_model_name=CURRENT_SPEAKER_MODEL,
            )
            preload_flag = bool(plan["preload_cluster"] or plan["preload_mapping"])

        tracker_status = reload_speaker_tracker(
            preload_cluster=plan["preload_cluster"],
            preload_mapping=plan["preload_mapping"],
            sv_model_name=CURRENT_SPEAKER_MODEL,
        )
    except Exception as e:
        tracker_error = str(e)
        logger.warning(f"[Speaker] Failed to reload streaming tracker: {e}")

    diarizer = None
    diarizer_status = "mock" if MOCK_MODE else "disabled"
    diarizer_error = None
    try:
        should_preload_offline = bool(
            DIARIZATION_AVAILABLE
            and not MOCK_MODE
            and "plan" in locals()
            and plan.get("preload_mapping")
        )
        if should_preload_offline:
            diarizer = _new_speaker_diarizer()
            diarizer.load()
            diarizer_status = "preloaded"
        elif not MOCK_MODE and DIARIZATION_AVAILABLE:
            diarizer_status = "disabled"
    except Exception as e:
        diarizer = None
        diarizer_status = "error"
        diarizer_error = str(e)
        logger.warning("[Speaker] Failed to preload offline diarizer: %s", e)

    return {
        "status": "reloaded",
        "preload": preload_flag,
        "speaker_model": CURRENT_SPEAKER_MODEL,
        "speaker_plan": plan if 'plan' in locals() else None,
        "stream_tracker": tracker_status,
        "stream_tracker_error": tracker_error,
        "diarizer_status": diarizer_status,
        "diarizer_error": diarizer_error,
    }


@app.post("/speakers/register")
async def register_speaker(
    name: str = Form(...),
    audio: UploadFile = File(...),
):
    """注册说话人声纹"""
    global diarizer
    
    if MOCK_MODE:
        return {"status": "registered (mock)", "speaker_id": "mock_speaker_001", "name": name}
    
    if not DIARIZATION_AVAILABLE:
        raise HTTPException(400, "Speaker diarization not available")
    
    if diarizer is None:
        diarizer = _new_speaker_diarizer()
        diarizer.load()
    
    # Save uploaded file
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
        content = await audio.read()
        tmp.write(content)
        tmp_path = tmp.name
    
    try:
        speaker_id = diarizer.register_speaker(name, tmp_path)
        return {"status": "registered", "speaker_id": speaker_id, "name": name}
    finally:
        os.unlink(tmp_path)


@app.get("/speakers")
async def list_speakers():
    """列出已注册的说话人"""
    global diarizer

    if MOCK_MODE:
        return {"speakers": [{"speaker_id": "mock_001", "name": "Mock User"}]}

    if not DIARIZATION_AVAILABLE:
        return {"speakers": []}

    # 如果 diarizer 未初始化，创建一个临时实例来读取已注册的说话人
    if diarizer is None:
        temp_diarizer = _new_speaker_diarizer()
        return {"speakers": temp_diarizer.list_speakers()}

    return {"speakers": diarizer.list_speakers()}


@app.delete("/speakers/{speaker_id}")
async def delete_speaker(speaker_id: str):
    """删除说话人"""
    global diarizer

    if MOCK_MODE:
        return {"status": "deleted (mock)", "speaker_id": speaker_id}

    if not DIARIZATION_AVAILABLE:
        raise HTTPException(400, "Speaker diarization not available")

    # 如果 diarizer 未初始化，创建一个临时实例
    target_diarizer = diarizer if diarizer else _new_speaker_diarizer()

    success = target_diarizer.delete_speaker(speaker_id)
    if not success:
        raise HTTPException(404, f"Speaker {speaker_id} not found")

    return {"status": "deleted", "speaker_id": speaker_id}


@app.get("/health")
async def health_check():
    """健康检查端点"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "mock_mode": MOCK_MODE,
        "speaker_model": CURRENT_SPEAKER_MODEL,
        "available_engines": {
            "whisper": WHISPER_AVAILABLE,
            "whispercpp": WHISPERCPP_AVAILABLE,
            "funasr": FUNASR_AVAILABLE,
            "parakeet": PARAKEET_AVAILABLE,
            "firered": FIRERED_AVAILABLE,
            "qwen3asr": QWEN3_ASR_AVAILABLE,
            "firered2": FIRERED2_AVAILABLE,
            "diarization": DIARIZATION_AVAILABLE,
            "ai_refine": AI_REFINE_AVAILABLE,
        }
    }


def main():
    global MOCK_MODE
    
    parser = argparse.ArgumentParser(description="VoiceScribe Backend Server")
    parser.add_argument("--mock", action="store_true", help="Run in mock mode (no ASR engines)")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8765, help="Port to bind (default: 8765)")
    args = parser.parse_args()
    
    MOCK_MODE = args.mock or (
        not WHISPER_AVAILABLE
        and not WHISPERCPP_AVAILABLE
        and not FUNASR_AVAILABLE
        and not PARAKEET_AVAILABLE
        and not FIRERED_AVAILABLE
        and not QWEN3_ASR_AVAILABLE
        and not FIRERED2_AVAILABLE
    )

    if MOCK_MODE:
        print("=" * 50)
        print("🎭 Running in MOCK MODE")
        print("   No ASR engines loaded, returning mock results")
        print("   Install ASR engines to enable transcription")
        print("=" * 50)
    else:
        print("=" * 50)
        print("🎤 VoiceScribe Backend Server")
        print(f"   Whisper:     {'✓' if WHISPER_AVAILABLE else '✗'}")
        print(f"   Whisper.cpp: {'✓' if WHISPERCPP_AVAILABLE else '✗'}")
        print(f"   FunASR:      {'✓' if FUNASR_AVAILABLE else '✗'}")
        print(f"   Parakeet:    {'✓' if PARAKEET_AVAILABLE else '✗'}")
        print(f"   FireRedASR:  {'✓' if FIRERED_AVAILABLE else '✗'}")
        print(f"   Diarization: {'✓' if DIARIZATION_AVAILABLE else '✗'}")
        print(f"   AI Refine:   {'✓' if AI_REFINE_AVAILABLE else '✗'}")
        print("=" * 50)
    
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
