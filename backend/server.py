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
import tempfile
import asyncio
import wave
from pathlib import Path
from typing import Optional, List, Literal
from datetime import datetime
import argparse
import importlib.util
import shutil
import json

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, WebSocket, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse
from pydantic import BaseModel
import uvicorn
from config import (
    CONFIG_DIR,
    MODEL_CACHE_DIR,
    MODEL_REGISTRY_PATH,
    MODELSCOPE_CACHE,
    WHISPER_CPP_MODEL_DIR,
    ensure_dirs,
    ensure_runtime_env,
    find_whisper_cli,
    HISTORY_STORAGE_PATH,
)
from runtime_probe import prepare_windows_runtime, probe_funasr_runtime, probe_torch_runtime

def _module_available(name: str) -> bool:
    return importlib.util.find_spec(name) is not None


def _whispercpp_cli_available() -> bool:
    return find_whisper_cli() is not None


def _whispercpp_model_available() -> bool:
    return (WHISPER_CPP_MODEL_DIR / "ggml-base.bin").exists()


TORCH_RUNTIME = probe_torch_runtime()
FUNASR_RUNTIME = probe_funasr_runtime()

# 尝试导入 ASR 引擎
WHISPER_AVAILABLE = False
WHISPERCPP_AVAILABLE = False
FUNASR_AVAILABLE = False
PARAKEET_AVAILABLE = False

try:
    from engines.whisper_engine import WhisperEngine
    # faster-whisper 或 whisper 任意可用即可
    WHISPER_AVAILABLE = _module_available("faster_whisper") or _module_available("whisper")
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
    FUNASR_AVAILABLE = _module_available("funasr") and bool(FUNASR_RUNTIME.get("ok"))
    if not _module_available("funasr"):
        print("[Warning] FunASR engine not available: missing funasr package")
    elif not FUNASR_AVAILABLE:
        print(f"[Warning] FunASR runtime not available: {FUNASR_RUNTIME.get('error')}")
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

# 设置运行时目录
ensure_runtime_env()
os.environ.setdefault("MODELSCOPE_CACHE", MODELSCOPE_CACHE)
os.environ.setdefault("VOICESCRIBE_CONFIG_DIR", str(CONFIG_DIR))
ensure_dirs()
prepare_windows_runtime()

# 下载状态缓存
model_downloads = {}

WHISPER_MODELS = ["tiny", "base", "small", "medium", "large-v2", "large-v3"]
WHISPERCPP_MODELS = ["tiny", "base", "small", "medium", "large"]
PARAKEET_MODELS = ["parakeet-ctc-1.1b", "parakeet-tdt-1.1b"]

WHISPER_MODEL_REPOS = {
    "tiny": "Systran/faster-whisper-tiny",
    "base": "Systran/faster-whisper-base",
    "small": "Systran/faster-whisper-small",
    "medium": "Systran/faster-whisper-medium",
    "large-v2": "Systran/faster-whisper-large-v2",
    "large-v3": "Systran/faster-whisper-large-v3",
}

WHISPERCPP_MODEL_FILES = {
    "tiny": "ggml-tiny.bin",
    "base": "ggml-base.bin",
    "small": "ggml-small.bin",
    "medium": "ggml-medium.bin",
    "large": "ggml-large.bin",
}

PARAKEET_MODEL_REPOS = {
    "parakeet-ctc-1.1b": "nvidia/parakeet-ctc-1.1b",
    "parakeet-tdt-1.1b": "nvidia/parakeet-tdt-1.1b",
}

ENGINE_MODEL_CATALOG = {
    "whisper": WHISPER_MODELS,
    "whispercpp": WHISPERCPP_MODELS,
    "funasr": list(getattr(globals().get("FunASREngine"), "MODELS", {}).keys()),
    "parakeet": PARAKEET_MODELS,
}

def _load_registry() -> dict:
    try:
        if MODEL_REGISTRY_PATH.exists():
            with MODEL_REGISTRY_PATH.open("r", encoding="utf-8") as f:
                return json.load(f)
    except Exception as e:
        print(f"[ModelRegistry] Failed to read registry: {e}")
    return {}

def _save_registry(registry: dict) -> None:
    try:
        with MODEL_REGISTRY_PATH.open("w", encoding="utf-8") as f:
            json.dump(registry, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[ModelRegistry] Failed to write registry: {e}")

def _is_within_models_dir(path: Path) -> bool:
    try:
        path.resolve().relative_to(MODEL_CACHE_DIR)
        return True
    except ValueError:
        return False


def _rebase_models_path(candidate: Path) -> Optional[Path]:
    parts = list(candidate.parts)
    lowered = [part.lower() for part in parts]
    if "models" not in lowered:
        return None

    models_index = lowered.index("models")
    rebased = MODEL_CACHE_DIR.joinpath(*parts[models_index + 1 :]).resolve()
    return rebased


def _normalize_registry_path(path: Optional[str]) -> Optional[str]:
    if not path:
        return path

    candidate = Path(path).expanduser()
    if candidate.exists() and _is_within_models_dir(candidate):
        return str(candidate.resolve())

    rebased = _rebase_models_path(candidate)
    if rebased and rebased.exists():
        return str(rebased)

    # 模型状态只认当前项目根目录 models/，不接受仓库外或历史目录。
    return None

def _get_registry_entry(engine: str, model: str) -> Optional[dict]:
    registry = _load_registry()
    entry = registry.get(engine, {}).get(model)
    if not entry:
        return None

    normalized_path = _normalize_registry_path(entry.get("path"))
    if not normalized_path:
        _delete_registry_entry(engine, model)
        return None

    if normalized_path != entry.get("path"):
        _set_registry_entry(
            engine,
            model,
            normalized_path,
            int(entry.get("size_bytes", 0) or 0),
        )
        entry = {
            **entry,
            "path": normalized_path,
        }

    return entry


def _model_storage_path(engine: str, model: str) -> Optional[Path]:
    if engine == "whisper":
        return (MODEL_CACHE_DIR / "whisper" / model).resolve()
    if engine == "whispercpp":
        filename = WHISPERCPP_MODEL_FILES.get(model)
        if filename:
            return (WHISPER_CPP_MODEL_DIR / filename).resolve()
    if engine == "funasr":
        model_id = _get_fun_asr_model_id(model)
        if model_id:
            return (MODEL_CACHE_DIR / Path(model_id)).resolve()
    if engine == "parakeet":
        return (MODEL_CACHE_DIR / "parakeet" / model).resolve()
    return None

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


def _reset_download_state(engine: str, model: str) -> None:
    key = f"{engine}:{model}"
    model_downloads.pop(key, None)

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
    return _dir_size(str(MODEL_CACHE_DIR))


def _path_size(path: Path) -> int:
    if not path.exists():
        return 0
    if path.is_file():
        return path.stat().st_size
    return _dir_size(str(path))

def _get_fun_asr_model_id(model_name: str) -> Optional[str]:
    try:
        return FunASREngine.MODELS.get(model_name)
    except Exception:
        return None


def _get_parakeet_model_id(model_name: str) -> Optional[str]:
    return PARAKEET_MODEL_REPOS.get(model_name)


def _iter_engine_models():
    for engine, model_names in ENGINE_MODEL_CATALOG.items():
        for model_name in model_names:
            yield engine, model_name


def _load_history_records() -> List[dict]:
    try:
        if HISTORY_STORAGE_PATH.exists():
            with HISTORY_STORAGE_PATH.open("r", encoding="utf-8") as f:
                payload = json.load(f)
            if isinstance(payload, dict):
                records = payload.get("records", [])
                if isinstance(records, list):
                    return records
            if isinstance(payload, list):
                return payload
    except Exception as e:
        print(f"[History] Failed to read history: {e}")
    return []


def _sort_history_records(records: List[dict]) -> List[dict]:
    return sorted(records, key=lambda item: item.get("created_at", ""), reverse=True)


def _save_history_records(records: List[dict]) -> None:
    HISTORY_STORAGE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with HISTORY_STORAGE_PATH.open("w", encoding="utf-8") as f:
        json.dump({"records": _sort_history_records(records)}, f, ensure_ascii=False, indent=2)


def _find_history_record(record_id: str) -> Optional[dict]:
    for record in _load_history_records():
        if record.get("id") == record_id:
            return record
    return None


def _history_export_text(record: dict) -> str:
    lines = [
        f"时间: {record.get('created_at', '')}",
        f"模式: {record.get('mode', '')}",
        f"引擎: {record.get('engine', '')}",
        f"模型: {record.get('model', '')}",
        f"时长: {record.get('duration', 0)}",
        "",
        "正文:",
        record.get("text", ""),
    ]

    summary = record.get("summary")
    if summary:
        lines.extend(["", "AI 摘要:", summary])

    speaker_entries = record.get("speaker_entries") or []
    if speaker_entries:
        lines.extend(["", "说话人片段:"])
        for entry in speaker_entries:
            speaker = entry.get("speaker") or "说话人"
            timestamp = entry.get("timestamp") or ""
            prefix = f"[{timestamp}] " if timestamp else ""
            lines.append(f"{prefix}{speaker}: {entry.get('text') or ''}")

    return "\n".join(lines).strip() + "\n"


def _delete_history_audio_file(record: dict) -> None:
    audio_path = record.get("audio_path")
    if not record.get("retain_audio") or not audio_path:
        return

    path = Path(audio_path)
    if path.exists() and path.is_file():
        try:
            path.unlink(missing_ok=True)
        except Exception as e:
            print(f"[History] Failed to delete audio file: {e}")


def _fallback_summary(text: str) -> str:
    condensed = " ".join(text.split())
    if len(condensed) <= 120:
        return condensed
    return condensed[:117].rstrip() + "..."


def _write_pcm16_wav(audio_bytes: bytes) -> str:
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
        with wave.open(tmp, "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(16000)
            wav_file.writeframes(audio_bytes)
        return tmp.name


def _realtime_entries_from_result(result: dict) -> List[dict]:
    timestamp = datetime.now().strftime("%H:%M:%S")
    segments = result.get("segments") or []
    entries = []

    if segments:
        for index, segment in enumerate(segments):
            text = (segment.get("text") or "").strip()
            if not text:
                continue
            entries.append(
                {
                    "id": f"{timestamp}-{index}",
                    "speaker": segment.get("speaker") or "说话人",
                    "text": text,
                    "timestamp": timestamp,
                }
            )
        return entries

    text = (result.get("text") or "").strip()
    if text:
        entries.append(
            {
                "id": f"{timestamp}-0",
                "speaker": "说话人",
                "text": text,
                "timestamp": timestamp,
            }
        )
    return entries

# Speaker diarization 是可选的
DIARIZATION_AVAILABLE = False
try:
    from diarization.speaker import SpeakerDiarizer
    DIARIZATION_AVAILABLE = bool(FUNASR_RUNTIME.get("ok"))
    if not DIARIZATION_AVAILABLE:
        print(f"[Warning] Speaker diarization runtime not available: {FUNASR_RUNTIME.get('error')}")
except Exception as e:
    print(f"[Warning] Speaker diarization not available: {e}")

# AI 文本优化是可选的
AI_REFINE_AVAILABLE = False
try:
    from postprocess.ai_refiner import AIRefiner
    AI_REFINE_AVAILABLE = True
except ImportError as e:
    print(f"[Warning] AI refiner not available: {e}")


app = FastAPI(title="VoiceScribe", version="0.1.0")

# CORS for local app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global instances
engines = {}
diarizer: Optional[object] = None
MOCK_MODE = False

# 预加载配置：默认禁用，避免阻塞服务启动
# 若需要启动时预加载，设置环境变量 VOICESCRIBE_PRELOAD_MODELS=1
PRELOAD_CONFIG = {
    "funasr": "seaco-paraformer",
}
ENABLE_PRELOAD = os.environ.get("VOICESCRIBE_PRELOAD_MODELS") == "1"


def _get_or_create_diarizer() -> "SpeakerDiarizer":
    global diarizer
    if diarizer is None:
        diarizer = SpeakerDiarizer()
    return diarizer


def _speaker_runtime_status() -> dict:
    if not DIARIZATION_AVAILABLE:
        return {
            "speaker_verification_loaded": False,
            "speaker_verification_model": None,
            "diarization_loaded": False,
            "diarization_model": None,
            "registered_speakers": 0,
        }

    speaker_service = diarizer if diarizer is not None else SpeakerDiarizer()
    return speaker_service.runtime_status()


def ensure_speaker_verification_loaded() -> "SpeakerDiarizer":
    if not DIARIZATION_AVAILABLE:
        raise HTTPException(400, f"Speaker features not available: {FUNASR_RUNTIME.get('error') or 'runtime probe failed'}")

    speaker_service = _get_or_create_diarizer()
    speaker_service.ensure_speaker_verification_loaded()
    print(
        f"[Speaker] Speaker verification ready: model={speaker_service.sv_model_id}, registered={len(speaker_service.speakers)}"
    )
    return speaker_service


def ensure_diarization_loaded() -> "SpeakerDiarizer":
    if not DIARIZATION_AVAILABLE:
        raise HTTPException(400, f"Speaker diarization not available: {FUNASR_RUNTIME.get('error') or 'runtime probe failed'}")

    speaker_service = _get_or_create_diarizer()
    speaker_service.ensure_diarization_loaded()
    print(
        f"[Speaker] Diarization ready: model={speaker_service.diarization_model_id}, registered={len(speaker_service.speakers)}"
    )
    return speaker_service


async def ensure_engine_loaded(
    engine: str,
    model: str,
    enable_diarization: bool = False,
):
    global engines

    existing = engines.get(engine)
    if existing and existing.get("model") == model:
        if engine != "funasr" or not enable_diarization or existing.get("diarization", False):
            print(
                f"[Load] Reusing engine={engine} model={model} diarization={existing.get('diarization', False)}"
            )
            return existing

    if MOCK_MODE:
        engines[engine] = {"engine": None, "model": model, "diarization": bool(enable_diarization)}
        return engines[engine]

    print(f"[Load] Loading engine={engine} model={model} diarization={enable_diarization}")

    if engine == "whisper":
        if not WHISPER_AVAILABLE:
            raise HTTPException(400, "Whisper engine not available. Install faster-whisper.")
        eng = WhisperEngine()
        whisper_entry = _get_registry_entry("whisper", model)
        load_target = whisper_entry["path"] if whisper_entry and os.path.exists(whisper_entry.get("path", "")) else model
        eng.load(load_target)
        engines["whisper"] = {"engine": eng, "model": model, "load_target": load_target}
    elif engine == "whispercpp":
        if not WHISPERCPP_AVAILABLE:
            raise HTTPException(400, "Whisper.cpp engine not available. Install whisper-cpp via brew.")
        whispercpp_entry = _get_registry_entry("whispercpp", model)
        model_path = whispercpp_entry["path"] if whispercpp_entry and os.path.exists(whispercpp_entry.get("path", "")) else str(WHISPER_CPP_MODEL_DIR / f"ggml-{model}.bin")
        eng = WhisperCppEngine(model_path=model_path)
        engines["whispercpp"] = {"engine": eng, "model": model, "load_target": model_path}
    elif engine == "funasr":
        if not FUNASR_AVAILABLE:
            raise HTTPException(400, f"FunASR engine not available: {FUNASR_RUNTIME.get('error') or 'runtime probe failed'}")
        eng = FunASREngine()
        eng.load(model, enable_diarization=bool(enable_diarization))
        engines["funasr"] = {
            "engine": eng,
            "model": model,
            "diarization": bool(enable_diarization),
            "load_target": model,
        }
    elif engine == "parakeet":
        if not PARAKEET_AVAILABLE:
            raise HTTPException(400, "Parakeet engine not available. Requires NVIDIA GPU and NeMo toolkit.")
        eng = ParakeetEngine()
        parakeet_entry = _get_registry_entry("parakeet", model)
        load_target = parakeet_entry["path"] if parakeet_entry and os.path.exists(parakeet_entry.get("path", "")) else model
        eng.load(load_target)
        engines["parakeet"] = {"engine": eng, "model": model, "load_target": load_target}
    else:
        raise HTTPException(400, f"Unknown engine: {engine}")

    print(f"[Load] Loaded engine={engine} model={model} runtime={engines[engine]}")
    return engines[engine]


def _extract_builtin_speaker_labels(result: dict) -> List[dict]:
    diarization_list = []
    for seg in result.get("segments", []):
        speaker = seg.get("speaker")
        if speaker is None:
            continue
        diarization_list.append(
            {
                "start": seg.get("start", 0.0),
                "end": seg.get("end", 0.0),
                "speaker": speaker,
            }
        )
    return diarization_list


@app.on_event("startup")
async def preload_models():
    """启动时预加载模型，避免首次转录等待"""
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


class ModelStatus(BaseModel):
    engine: str
    model: str
    available: bool
    downloading: bool
    size_bytes: Optional[int] = None
    downloaded_bytes: Optional[int] = None
    error: Optional[str] = None


class HistorySpeakerEntry(BaseModel):
    speaker: Optional[str] = None
    text: str
    timestamp: Optional[str] = None


class HistoryRecordPayload(BaseModel):
    id: str
    created_at: str
    mode: Literal["stream", "non-stream"]
    text: str
    duration: float
    engine: str
    model: str
    speaker_entries: List[HistorySpeakerEntry] = []
    summary: Optional[str] = None
    retain_audio: bool = False
    audio_path: Optional[str] = None


class HistoryResponse(BaseModel):
    records: List[HistoryRecordPayload]


class SummaryRequest(BaseModel):
    text: str


class SummaryResponse(BaseModel):
    summary: str


@app.get("/")
async def root():
    return {
        "status": "ok",
        "service": "VoiceScribe",
        "mode": "mock" if MOCK_MODE else "production",
        "engines": {
            "whisper": WHISPER_AVAILABLE,
            "funasr": FUNASR_AVAILABLE,
            "diarization": DIARIZATION_AVAILABLE,
            "ai_refine": AI_REFINE_AVAILABLE,
        },
        "runtime_checks": {
            "torch": TORCH_RUNTIME,
            "funasr": FUNASR_RUNTIME,
        }
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
        ),
        EngineInfo(
            name="whispercpp",
            models=WHISPERCPP_MODELS,
            loaded_model=engines.get("whispercpp", {}).get("model"),
            available=WHISPERCPP_AVAILABLE,
        ),
        EngineInfo(
            name="funasr",
            models=list(FunASREngine.MODELS.keys()),
            loaded_model=engines.get("funasr", {}).get("model"),
            available=FUNASR_AVAILABLE,
        ),
        EngineInfo(
            name="parakeet",
            models=PARAKEET_MODELS,
            loaded_model=engines.get("parakeet", {}).get("model"),
            available=PARAKEET_AVAILABLE,
        ),
    ]
    return available


def _get_model_status(engine: str, model: str) -> ModelStatus:
    key = f"{engine}:{model}"
    download_state = model_downloads.get(key, {})

    entry = _get_registry_entry(engine, model)
    available = False
    size_bytes = None

    if not entry:
        storage_path = _model_storage_path(engine, model)
        if storage_path and storage_path.exists():
            size_bytes = _path_size(storage_path)
            _set_registry_entry(engine, model, str(storage_path), size_bytes)
            entry = _get_registry_entry(engine, model)

    if entry and os.path.exists(entry.get("path", "")):
        available = True
        size_bytes = entry.get("size_bytes") or _path_size(Path(entry["path"]))
    elif entry and not os.path.exists(entry.get("path", "")):
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


async def _monitor_download_path(target_path: Path, state: dict, stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        try:
            state["downloaded_bytes"] = _path_size(target_path)
        except Exception:
            pass
        await asyncio.sleep(1.0)


async def _download_hf_snapshot(
    engine: str,
    model_name: str,
    repo_id: str,
    target_dir: Path,
) -> None:
    key = f"{engine}:{model_name}"
    state = model_downloads.setdefault(key, {})
    state["downloading"] = True
    state["error"] = None
    state["downloaded_bytes"] = 0

    stop_event = asyncio.Event()
    target_dir.parent.mkdir(parents=True, exist_ok=True)
    monitor_task = asyncio.create_task(_monitor_download_path(target_dir, state, stop_event))

    try:
        if not _module_available("huggingface_hub"):
            raise RuntimeError("huggingface_hub not available")

        from huggingface_hub import snapshot_download

        local_dir = await asyncio.to_thread(
            snapshot_download,
            repo_id=repo_id,
            local_dir=str(target_dir),
        )

        size_bytes = _path_size(Path(local_dir))
        _set_registry_entry(engine, model_name, local_dir, size_bytes)
        state["size_bytes"] = size_bytes
        state["downloaded_bytes"] = size_bytes
    except Exception as e:
        state["error"] = str(e)
    finally:
        stop_event.set()
        try:
            await monitor_task
        except Exception:
            pass
        state["downloading"] = False


async def _download_hf_file(
    engine: str,
    model_name: str,
    repo_id: str,
    filename: str,
    target_dir: Path,
) -> None:
    key = f"{engine}:{model_name}"
    state = model_downloads.setdefault(key, {})
    state["downloading"] = True
    state["error"] = None
    state["downloaded_bytes"] = 0

    target_dir.mkdir(parents=True, exist_ok=True)
    target_file = (target_dir / filename).resolve()
    stop_event = asyncio.Event()
    monitor_task = asyncio.create_task(_monitor_download_path(target_file, state, stop_event))

    try:
        if not _module_available("huggingface_hub"):
            raise RuntimeError("huggingface_hub not available")

        from huggingface_hub import hf_hub_download

        local_file = await asyncio.to_thread(
            hf_hub_download,
            repo_id=repo_id,
            filename=filename,
            local_dir=str(target_dir),
        )

        size_bytes = _path_size(Path(local_file))
        _set_registry_entry(engine, model_name, local_file, size_bytes)
        state["size_bytes"] = size_bytes
        state["downloaded_bytes"] = size_bytes
    except Exception as e:
        state["error"] = str(e)
    finally:
        stop_event.set()
        try:
            await monitor_task
        except Exception:
            pass
        state["downloading"] = False


async def _download_funasr_model(model_name: str) -> None:
    model_id = _get_fun_asr_model_id(model_name)
    if not model_id:
        raise ValueError(f"Unknown FunASR model: {model_name}")

    key = f"funasr:{model_name}"
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
        if not _module_available("modelscope"):
            raise RuntimeError("modelscope not available")

        from modelscope.hub.snapshot_download import snapshot_download

        local_dir = await asyncio.to_thread(
            snapshot_download, model_id, cache_dir=str(MODEL_CACHE_DIR)
        )

        size_bytes = _dir_size(local_dir)
        _set_registry_entry("funasr", model_name, local_dir, size_bytes)
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


async def _download_whisper_model(model_name: str) -> None:
    repo_id = WHISPER_MODEL_REPOS.get(model_name)
    if not repo_id:
        raise ValueError(f"Unknown Whisper model: {model_name}")
    await _download_hf_snapshot(
        "whisper",
        model_name,
        repo_id,
        (MODEL_CACHE_DIR / "whisper" / model_name).resolve(),
    )


async def _download_whispercpp_model(model_name: str) -> None:
    filename = WHISPERCPP_MODEL_FILES.get(model_name)
    if not filename:
        raise ValueError(f"Unknown Whisper.cpp model: {model_name}")
    await _download_hf_file(
        "whispercpp",
        model_name,
        "ggerganov/whisper.cpp",
        filename,
        WHISPER_CPP_MODEL_DIR,
    )


async def _download_parakeet_model(model_name: str) -> None:
    repo_id = _get_parakeet_model_id(model_name)
    if not repo_id:
        raise ValueError(f"Unknown Parakeet model: {model_name}")
    await _download_hf_snapshot(
        "parakeet",
        model_name,
        repo_id,
        (MODEL_CACHE_DIR / "parakeet" / model_name).resolve(),
    )


@app.get("/models")
async def list_models() -> List[ModelStatus]:
    """列出所有引擎模型状态"""
    models = []
    for engine, model_name in _iter_engine_models():
        models.append(_get_model_status(engine, model_name))
    return models


@app.post("/models/download")
async def download_model(engine: str = Form(...), model: str = Form(...)):
    if engine not in ENGINE_MODEL_CATALOG or model not in ENGINE_MODEL_CATALOG[engine]:
        raise HTTPException(400, f"Unknown engine/model: {engine}/{model}")

    status = _get_model_status(engine, model)
    if status.available or status.downloading:
        return {"status": "already", "engine": engine, "model": model}

    if engine == "funasr":
        if not FUNASR_AVAILABLE:
            raise HTTPException(400, "FunASR engine not available")
        asyncio.create_task(_download_funasr_model(model))
    elif engine == "whisper":
        asyncio.create_task(_download_whisper_model(model))
    elif engine == "whispercpp":
        asyncio.create_task(_download_whispercpp_model(model))
    elif engine == "parakeet":
        asyncio.create_task(_download_parakeet_model(model))
    else:
        raise HTTPException(400, f"Download not supported for engine: {engine}")
    return {"status": "started", "engine": engine, "model": model}


@app.post("/models/delete")
async def delete_model(engine: str = Form(...), model: str = Form(...)):
    if engine not in ENGINE_MODEL_CATALOG or model not in ENGINE_MODEL_CATALOG[engine]:
        raise HTTPException(400, f"Unknown engine/model: {engine}/{model}")

    entry = _get_registry_entry(engine, model)
    if entry and os.path.exists(entry.get("path", "")):
        target_path = Path(entry["path"])
        if target_path.is_file():
            target_path.unlink(missing_ok=True)
        else:
            shutil.rmtree(target_path, ignore_errors=True)
    else:
        fallback_path = _model_storage_path(engine, model)
        if fallback_path and fallback_path.exists():
            if fallback_path.is_file():
                fallback_path.unlink(missing_ok=True)
            else:
                shutil.rmtree(fallback_path, ignore_errors=True)
    _delete_registry_entry(engine, model)
    _reset_download_state(engine, model)
    return {"status": "deleted", "engine": engine, "model": model}


@app.get("/history")
async def list_history() -> HistoryResponse:
    records = [HistoryRecordPayload(**record) for record in _sort_history_records(_load_history_records())]
    return HistoryResponse(records=records)


@app.post("/history")
async def upsert_history(record: HistoryRecordPayload):
    records = _load_history_records()
    next_records = [item for item in records if item.get("id") != record.id]
    payload = record.model_dump() if hasattr(record, "model_dump") else record.dict()
    next_records.append(payload)
    _save_history_records(next_records)
    return {"status": "saved", "id": record.id}


@app.delete("/history/{record_id}")
async def delete_history(record_id: str):
    records = _load_history_records()
    target = None
    next_records = []
    for item in records:
        if item.get("id") == record_id:
            target = item
        else:
            next_records.append(item)
    if len(next_records) == len(records):
        raise HTTPException(404, f"History record {record_id} not found")
    if target:
        _delete_history_audio_file(target)
    _save_history_records(next_records)
    return {"status": "deleted", "id": record_id}


@app.delete("/history")
async def clear_history():
    for record in _load_history_records():
        _delete_history_audio_file(record)
    _save_history_records([])
    return {"status": "cleared"}


@app.get("/history/{record_id}/download/text")
async def download_history_text(record_id: str):
    record = _find_history_record(record_id)
    if not record:
        raise HTTPException(404, f"History record {record_id} not found")

    filename = f"voicescribe-history-{record_id}.txt"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return PlainTextResponse(_history_export_text(record), headers=headers)


@app.get("/history/{record_id}/download/audio")
async def download_history_audio(record_id: str):
    record = _find_history_record(record_id)
    if not record:
        raise HTTPException(404, f"History record {record_id} not found")

    audio_path = record.get("audio_path")
    retain_audio = bool(record.get("retain_audio"))
    if not retain_audio or not audio_path:
        raise HTTPException(404, "Audio not retained for this history record")

    path = Path(audio_path)
    if not path.exists() or not path.is_file():
        raise HTTPException(404, "Audio file not found")

    return FileResponse(path, filename=path.name)


@app.post("/summary")
async def summarize_text(payload: SummaryRequest) -> SummaryResponse:
    text = (payload.text or "").strip()
    if not text:
        return SummaryResponse(summary="")

    if AI_REFINE_AVAILABLE:
        try:
            refiner = AIRefiner()
            if hasattr(refiner, "summarize"):
                return SummaryResponse(summary=refiner.summarize(text))
        except Exception as e:
            print(f"[Summary] AI summary failed, falling back: {e}")

    return SummaryResponse(summary=_fallback_summary(text))


@app.post("/load")
async def load_engine(
    engine: Optional[str] = Form(None),
    model: Optional[str] = Form(None),
    enable_diarization: Optional[bool] = Form(None),
    request: Request = None,
):
    if engine is None or model is None:
        if request is not None:
            engine = engine or request.query_params.get("engine")
            model = model or request.query_params.get("model")
    if engine is None or model is None:
        raise HTTPException(422, "Missing engine/model")

    await ensure_engine_loaded(engine, model, bool(enable_diarization) if engine == "funasr" else False)
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


@app.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    engine: str = Form("whisper"),
    model: str = Form("large-v3"),
    language: str = Form("zh"),
    enable_diarization: bool = Form(False),
    hotwords: str = Form(""),
    enable_ai_refine: bool = Form(False),
) -> TranscribeResult:
    """转录音频文件"""
    global diarizer

    suffix = Path(audio.filename).suffix or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await audio.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        if MOCK_MODE:
            result = mock_transcribe(tmp_path, language)
            if enable_ai_refine and AI_REFINE_AVAILABLE:
                refiner = AIRefiner()
                hotwords_list = [w.strip() for w in hotwords.split(",") if w.strip()]
                result["text"] = refiner.refine(result["text"], hotwords_list)
            return TranscribeResult(
                text=result["text"],
                segments=result.get("segments", []),
                duration=result.get("duration", 0),
                engine=f"{engine} (mock)",
                model=model,
            )

        entry = await ensure_engine_loaded(
            engine,
            model,
            bool(enable_diarization) if engine == "funasr" else False,
        )
        eng = entry["engine"]

        print(
            f"[Transcribe] Start engine={engine} model={model} diarization={enable_diarization} ai_refine={enable_ai_refine}"
        )

        if engine == "funasr" and hotwords:
            print(f"[Transcribe] FunASR with hotwords: {hotwords}")
            result = eng.transcribe(tmp_path, language=language, hotwords=hotwords)
        else:
            print(f"[Transcribe] Engine={engine}, hotwords={hotwords or '(none)'}")
            result = eng.transcribe(tmp_path, language=language)

        diarization_done = False
        if enable_diarization:
            builtin_diarization = _extract_builtin_speaker_labels(result)
            if engine == "funasr" and builtin_diarization:
                print(
                    f"[Speaker] Using FunASR built-in speaker labels: segments={len(builtin_diarization)}"
                )
                diarization_done = True
                if DIARIZATION_AVAILABLE:
                    speaker_service = _get_or_create_diarizer()
                    if speaker_service.speakers:
                        speaker_service.ensure_speaker_verification_loaded()
                        print("[Speaker] Mapping FunASR labels with speaker verification")
                        result = speaker_service.assign_speakers(
                            result,
                            builtin_diarization,
                            audio_path=tmp_path,
                        )
                    else:
                        print("[Speaker] No registered speakers, keeping FunASR labels")
                        result = speaker_service.assign_speakers(result, builtin_diarization)
                else:
                    print("[Speaker] SpeakerDiarizer unavailable, returning FunASR speaker labels only")

            if not diarization_done:
                if not DIARIZATION_AVAILABLE:
                    raise HTTPException(400, "Speaker diarization helper not available")

                speaker_service = ensure_diarization_loaded()
                if speaker_service.speakers:
                    speaker_service.ensure_speaker_verification_loaded()
                    print("[Speaker] Using external diarization with speaker verification mapping")
                else:
                    print("[Speaker] Using external diarization without registered speaker mapping")

                speakers = speaker_service.diarize(tmp_path)
                print(f"[Speaker] External diarization produced {len(speakers)} segments")
                result = speaker_service.assign_speakers(result, speakers, audio_path=tmp_path)
                diarization_done = True

            if not diarization_done:
                raise HTTPException(500, "Speaker diarization requested but no diarization result was produced")

        if enable_ai_refine and AI_REFINE_AVAILABLE:
            refiner = AIRefiner()
            hotwords_list = [w.strip() for w in hotwords.split(",") if w.strip()]
            print(f"[AI Refine] Hotwords: {hotwords_list}")
            print(f"[AI Refine] Original: {result['text'][:100]}...")
            result["text"] = refiner.refine(result["text"], hotwords_list)
            print(f"[AI Refine] Refined: {result['text'][:100]}...")

        return TranscribeResult(
            text=result["text"],
            segments=result.get("segments", []),
            duration=result.get("duration", 0),
            engine=engine,
            model=model,
        )

    finally:
        os.unlink(tmp_path)


@app.websocket("/stream")
async def stream_transcribe(websocket: WebSocket):
    """实时流式转录，接收 16kHz / 16-bit / mono PCM 数据块。"""
    await websocket.accept()
    
    if MOCK_MODE:
        try:
            while True:
                await websocket.receive_bytes()
                await websocket.send_json({
                    "type": "entry",
                    "entry": {
                        "id": datetime.now().strftime("%H:%M:%S"),
                        "speaker": "说话人",
                        "text": "[Mock] 正在实时转录...",
                        "timestamp": datetime.now().strftime("%H:%M:%S"),
                    },
                })
        except Exception:
            pass
        finally:
            await websocket.close()
        return
    
    if not WHISPER_AVAILABLE:
        await websocket.send_json({
            "type": "error",
            "message": "Whisper engine not available for streaming"
        })
        await websocket.close()
        return
    
    engine_name = "whisper"
    model = "base"
    
    if engine_name not in engines:
        eng = WhisperEngine()
        eng.load(model)
        engines[engine_name] = {"engine": eng, "model": model}
    
    eng = engines[engine_name]["engine"]
    
    buffer = bytearray()
    chunk_duration = 8
    sample_rate = 16000
    chunk_size = chunk_duration * sample_rate * 2
    
    try:
        while True:
            data = await websocket.receive_bytes()
            buffer.extend(data)
            
            if len(buffer) >= chunk_size:
                chunk = bytes(buffer[:chunk_size])
                del buffer[:chunk_size]
                tmp_path = _write_pcm16_wav(chunk)
                
                try:
                    result = eng.transcribe(tmp_path, language="zh")
                    entries = _realtime_entries_from_result(result)
                    for entry in entries:
                        await websocket.send_json({"type": "entry", "entry": entry})
                finally:
                    os.unlink(tmp_path)
    
    except Exception as e:
        await websocket.send_json({"type": "error", "message": str(e)})
    finally:
        if buffer:
            try:
                tmp_path = _write_pcm16_wav(bytes(buffer))
                result = eng.transcribe(tmp_path, language="zh")
                entries = _realtime_entries_from_result(result)
                for entry in entries:
                    await websocket.send_json({"type": "entry", "entry": entry})
            except Exception as e:
                await websocket.send_json({"type": "error", "message": str(e)})
            finally:
                try:
                    os.unlink(tmp_path)
                except Exception:
                    pass
        await websocket.close()


@app.post("/speakers/register")
async def register_speaker(
    name: str = Form(...),
    audio: UploadFile = File(...),
):
    """注册说话人声纹"""
    if MOCK_MODE:
        return {"status": "registered (mock)", "speaker_id": "mock_speaker_001", "name": name}

    speaker_service = ensure_speaker_verification_loaded()

    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
        content = await audio.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        speaker_id = speaker_service.register_speaker(name, tmp_path)
        print(
            f"[Speaker] Registered speaker name={name} id={speaker_id} sv_model={speaker_service.sv_model_id}"
        )
        return {"status": "registered", "speaker_id": speaker_id, "name": name}
    finally:
        os.unlink(tmp_path)


@app.get("/speakers")
async def list_speakers():
    """列出已注册的说话人"""
    if MOCK_MODE:
        return {"speakers": [{"speaker_id": "mock_001", "name": "Mock User"}]}

    if not DIARIZATION_AVAILABLE:
        return {"speakers": []}

    speaker_service = diarizer if diarizer is not None else SpeakerDiarizer()
    return {"speakers": speaker_service.list_speakers()}


@app.delete("/speakers/{speaker_id}")
async def delete_speaker(speaker_id: str):
    """删除说话人"""
    if MOCK_MODE:
        return {"status": "deleted (mock)", "speaker_id": speaker_id}

    if not DIARIZATION_AVAILABLE:
        raise HTTPException(400, f"Speaker features not available: {FUNASR_RUNTIME.get('error') or 'runtime probe failed'}")

    target_diarizer = diarizer if diarizer else SpeakerDiarizer()
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
        "available_engines": {
            "whisper": WHISPER_AVAILABLE,
            "funasr": FUNASR_AVAILABLE,
            "diarization": DIARIZATION_AVAILABLE,
            "ai_refine": AI_REFINE_AVAILABLE,
        },
        "loaded_engines": {
            name: {
                "model": entry.get("model"),
                "diarization": bool(entry.get("diarization", False)),
                "load_target": entry.get("load_target"),
            }
            for name, entry in engines.items()
        },
        "speaker_runtime": _speaker_runtime_status(),
        "runtime_checks": {
            "torch": TORCH_RUNTIME,
            "funasr": FUNASR_RUNTIME,
        },
    }


def main():
    global MOCK_MODE
    
    parser = argparse.ArgumentParser(description="VoiceScribe Backend Server")
    parser.add_argument("--mock", action="store_true", help="Run in mock mode (no ASR engines)")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8765, help="Port to bind (default: 8765)")
    args = parser.parse_args()
    
    MOCK_MODE = args.mock or (not WHISPER_AVAILABLE and not WHISPERCPP_AVAILABLE and not FUNASR_AVAILABLE and not PARAKEET_AVAILABLE)

    if MOCK_MODE:
        print("=" * 50)
        print("Running in MOCK MODE")
        print("   No ASR engines loaded, returning mock results")
        print("   Install whisper-cpp via: brew install whisper-cpp")
        print("=" * 50)
    else:
        print("=" * 50)
        print("VoiceScribe Backend Server")
        print(f"   Whisper:     {'OK' if WHISPER_AVAILABLE else 'NO'}")
        print(f"   Whisper.cpp: {'OK' if WHISPERCPP_AVAILABLE else 'NO'}")
        print(f"   FunASR:      {'OK' if FUNASR_AVAILABLE else 'NO'}")
        print(f"   Parakeet:    {'OK' if PARAKEET_AVAILABLE else 'NO'}")
        print(f"   Diarization: {'OK' if DIARIZATION_AVAILABLE else 'NO'}")
        print(f"   AI Refine:   {'OK' if AI_REFINE_AVAILABLE else 'NO'}")
        print("=" * 50)
    
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()

