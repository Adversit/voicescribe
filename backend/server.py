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
from typing import Optional, List, Literal, Dict, Any
from datetime import datetime
import argparse
import importlib.util
import shutil
import json
import warnings
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, WebSocket, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse
from pydantic import BaseModel, Field
import uvicorn
from config import (
    CONFIG_DIR,
    configure_jieba_cache,
    HF_HOME_DIR,
    JIEBA_CACHE_FILE,
    MODEL_CACHE_DIR,
    MODEL_REGISTRY_PATH,
    MODELSCOPE_CACHE,
    PROJECT_ROOT,
    migrate_legacy_caches,
    WHISPER_CPP_MODEL_DIR,
    ensure_dirs,
    ensure_runtime_env,
    find_whisper_cli,
    HISTORY_STORAGE_PATH,
)
from runtime_probe import prepare_windows_runtime, probe_funasr_runtime, probe_torch_runtime
from services.agent_service import SUPPORTED_AGENT_PROVIDERS, AgentRequest, AgentService
from services.agent_task_service import AgentTaskService
from services.history_service import HistoryService
from services.model_catalog import (
    all_model_entries,
    build_engine_catalog,
    build_engine_model_catalog,
    engine_available,
    find_model_definition,
    validate_engine_selection,
)
from services.model_registry import ModelRegistryService
from services.transcription_service import RuntimeTranscriptionService
from services.text_processing_service import (
    SUPPORTED_PROVIDERS,
    TextProcessingRequest,
    TextProcessingService,
)
from services.text_processing_task_service import TextProcessingTaskService

# Suppress jieba's known pkg_resources deprecation noise during startup.
warnings.filterwarnings(
    "ignore",
    message=r"pkg_resources is deprecated as an API.*",
    category=UserWarning,
    module=r"jieba\._compat",
)

ensure_runtime_env()
ensure_dirs()
prepare_windows_runtime()
MIGRATION_MESSAGES = migrate_legacy_caches()
configure_jieba_cache()
if MIGRATION_MESSAGES:
    for message in MIGRATION_MESSAGES:
        print(f"[CacheMigration] {message}")

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
QWEN3_ASR_AVAILABLE = False

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
        print("[Notice] Whisper.cpp engine not available: missing whisper-cli or model")
except Exception as e:
    print(f"[Notice] Whisper.cpp engine not available: {e}")

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
        print("[Notice] Parakeet engine not available: missing nemo_toolkit")
except ImportError as e:
    print(f"[Notice] Parakeet engine not available: {e}")

try:
    from engines.qwen3_asr_engine import Qwen3ASREngine
    QWEN3_ASR_AVAILABLE = _module_available("qwen_asr")
    if not QWEN3_ASR_AVAILABLE:
        print("[Warning] Qwen3-ASR engine not available: missing qwen-asr")
except ImportError as e:
    print(f"[Warning] Qwen3-ASR engine not available: {e}")

# 设置运行时目录
ensure_runtime_env()
os.environ.setdefault("MODELSCOPE_CACHE", MODELSCOPE_CACHE)
os.environ.setdefault("VOICESCRIBE_CONFIG_DIR", str(CONFIG_DIR))

# 下载状态缓存
model_downloads = {}

WHISPER_MODELS = ["tiny", "base", "small", "medium", "large-v2", "large-v3"]
WHISPERCPP_MODELS = ["tiny", "base", "small", "medium", "large"]
PARAKEET_MODELS = ["parakeet-ctc-1.1b", "parakeet-tdt-1.1b"]
QWEN3_ASR_MODELS = ["qwen3-asr-1.7b"]

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

QWEN3_ASR_MODEL_REPOS = {
    "qwen3-asr-1.7b": "Qwen/Qwen3-ASR-1.7B",
}

THREE_D_SPEAKER_COMPONENTS = [
    {
        "name": "speaker_embedding",
        "model_id": "iic/speech_campplus_sv_zh_en_16k-common_advanced",
        "revision": "v1.0.0",
    },
    {
        "name": "vad",
        "model_id": "iic/speech_fsmn_vad_zh-cn-16k-common-pytorch",
        "revision": "v2.0.4",
    },
]

DIARIZATION_MODELS = {
    "funasr_builtin": {
        "display_name": "FunASR 内置分离",
        "downloadable": False,
        "requires_token": False,
        "engine_scope": ["funasr"],
    },
    "campplus-diarization": {
        "display_name": "CampPlus Diarization",
        "model_id": "iic/speech_campplus_speaker-diarization_common",
        "downloadable": True,
        "requires_token": False,
        "engine_scope": ["funasr", "qwen3_asr", "whisper", "whispercpp", "parakeet"],
    },
    "sond-diarization": {
        "display_name": "SOND Diarization",
        "model_id": "damo/speech_diarization_sond-zh-cn-alimeeting-16k-n16k4-pytorch",
        "downloadable": True,
        "requires_token": False,
        "engine_scope": ["funasr", "qwen3_asr", "whisper", "whispercpp", "parakeet"],
    },
    "3d-speaker": {
        "display_name": "3D-Speaker",
        "downloadable": True,
        "requires_token": False,
        "engine_scope": ["funasr", "qwen3_asr", "whisper", "whispercpp", "parakeet"],
    },
}

SPEAKER_MAPPING_MODELS = {
    "campp": {
        "display_name": "CAM++",
        "model_id": "damo/speech_campplus_sv_zh-cn_16k-common",
        "downloadable": True,
        "requires_token": False,
        "engine_scope": ["funasr", "qwen3_asr", "whisper", "whispercpp", "parakeet"],
    },
    "eres2netv2": {
        "display_name": "ERes2NetV2",
        "model_id": "iic/speech_eres2netv2_sv_zh-cn_16k-common",
        "downloadable": True,
        "requires_token": False,
        "engine_scope": ["funasr", "qwen3_asr", "whisper", "whispercpp", "parakeet"],
    },
}

ENGINE_CATALOG = build_engine_catalog(
    funasr_models=list(getattr(globals().get("FunASREngine"), "MODELS", {}).keys()),
    whisper_models=WHISPER_MODELS,
    whispercpp_models=WHISPERCPP_MODELS,
    parakeet_models=PARAKEET_MODELS,
    qwen3_asr_models=QWEN3_ASR_MODELS,
    diarization_models=DIARIZATION_MODELS,
    speaker_mapping_models=SPEAKER_MAPPING_MODELS,
    availability={
        "funasr": FUNASR_AVAILABLE,
        "qwen3_asr": QWEN3_ASR_AVAILABLE,
        "whisper": WHISPER_AVAILABLE,
        "whispercpp": WHISPERCPP_AVAILABLE,
        "parakeet": PARAKEET_AVAILABLE,
    },
)

ENGINE_MODEL_CATALOG = build_engine_model_catalog(ENGINE_CATALOG)


def _engine_available(engine: str) -> bool:
    return engine_available(ENGINE_CATALOG, engine)


def _category_bucket(category: str, engine: str) -> str:
    return ModelRegistryService.category_bucket(category, engine)


def _all_model_entries():
    return all_model_entries(ENGINE_CATALOG, DIARIZATION_MODELS, SPEAKER_MAPPING_MODELS)


def _find_model_definition(category: str, engine: str, model: str) -> Optional[dict]:
    return find_model_definition(
        ENGINE_CATALOG,
        DIARIZATION_MODELS,
        SPEAKER_MAPPING_MODELS,
        category,
        engine,
        model,
    )


def _validate_engine_selection(
    engine: str,
    asr_model: str,
    diarization_model: Optional[str],
    speaker_mapping_model: Optional[str],
) -> None:
    validate_engine_selection(
        ENGINE_CATALOG,
        engine,
        asr_model,
        diarization_model,
        speaker_mapping_model,
    )

def _load_registry() -> dict:
    return model_registry_service.load_registry()

def _save_registry(registry: dict) -> None:
    model_registry_service.save_registry(registry)

def _is_within_models_dir(path: Path) -> bool:
    return model_registry_service.is_within_models_dir(path)


def _rebase_models_path(candidate: Path) -> Optional[Path]:
    return model_registry_service.rebase_models_path(candidate)


def _normalize_registry_path(path: Optional[str]) -> Optional[str]:
    return model_registry_service.normalize_registry_path(path)

def _get_registry_entry(engine: str, model: str, category: str = "asr") -> Optional[dict]:
    return model_registry_service.get_registry_entry(engine, model, category=category)


def _model_storage_path(engine: str, model: str, category: str = "asr") -> Optional[Path]:
    return model_registry_service.model_storage_path(engine, model, category=category)

def _set_registry_entry(engine: str, model: str, path: str, size_bytes: int, category: str = "asr") -> None:
    model_registry_service.set_registry_entry(engine, model, path, size_bytes, category=category)

def _delete_registry_entry(engine: str, model: str, category: str = "asr") -> None:
    model_registry_service.delete_registry_entry(engine, model, category=category)


def _reset_download_state(engine: str, model: str, category: str = "asr") -> None:
    model_registry_service.reset_download_state(model_downloads, engine, model, category=category)

def _dir_size(path: str) -> int:
    return model_registry_service.dir_size(path)

def _cache_total_size() -> int:
    return model_registry_service.cache_total_size()


def _path_size(path: Path) -> int:
    return model_registry_service.path_size(path)

def _get_fun_asr_model_id(model_name: str) -> Optional[str]:
    try:
        return FunASREngine.MODELS.get(model_name)
    except Exception:
        return None


def _get_parakeet_model_id(model_name: str) -> Optional[str]:
    return PARAKEET_MODEL_REPOS.get(model_name)


model_registry_service = ModelRegistryService(
    model_cache_dir=MODEL_CACHE_DIR,
    registry_path=MODEL_REGISTRY_PATH,
    whisper_cpp_model_dir=WHISPER_CPP_MODEL_DIR,
    whispercpp_model_files=WHISPERCPP_MODEL_FILES,
    diarization_models=DIARIZATION_MODELS,
    speaker_mapping_models=SPEAKER_MAPPING_MODELS,
    get_funasr_model_id=_get_fun_asr_model_id,
)


def _iter_engine_models():
    for category, engine, model_name, _ in _all_model_entries():
        yield category, engine, model_name


history_service = HistoryService(HISTORY_STORAGE_PATH)
text_processing_service = TextProcessingService(
    model_root=MODEL_CACHE_DIR,
    runtime_dir=CONFIG_DIR / "text-processing-runtime",
)
text_processing_task_service = TextProcessingTaskService(text_processing_service)
agent_service = AgentService(project_root=PROJECT_ROOT, model_root=MODEL_CACHE_DIR)
agent_task_service = AgentTaskService(agent_service)


def _load_history_records() -> List[dict]:
    return history_service.load_records()


def _sort_history_records(records: List[dict]) -> List[dict]:
    return history_service.sort_records(records)


def _save_history_records(records: List[dict]) -> None:
    history_service.save_records(records)


def _find_history_record(record_id: str) -> Optional[dict]:
    return history_service.find_record(record_id)


def _history_export_text(record: dict) -> str:
    return history_service.export_text(record)


def _delete_history_audio_file(record: dict) -> None:
    history_service.delete_audio_file(record)


def _fallback_summary(text: str) -> str:
    condensed = " ".join(text.split())
    if len(condensed) <= 120:
        return condensed
    return condensed[:117].rstrip() + "..."


def _apply_text_processing(
    result: dict,
    *,
    profile: str,
    provider: str,
    model: str,
    base_url: str,
    target_language: str,
    hotwords: str,
    target_context: Optional[dict] = None,
    legacy_enable_ai_refine: bool = False,
) -> Optional[str]:
    effective_profile = "light" if legacy_enable_ai_refine and profile == "raw" else profile
    processing = text_processing_service.process(
        TextProcessingRequest(
            text=result.get("text") or "",
            profile=effective_profile,
            provider=provider,
            model=model,
            base_url=base_url,
            target_language=target_language,
            hotwords=tuple(word.strip() for word in hotwords.split(",") if word.strip()),
            target_context=target_context,
        )
    )
    result["raw_text"] = processing.raw_text
    result["text"] = processing.text
    result["text_processing"] = processing.to_dict()
    return processing.warning


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

# Global instances
MOCK_MODE = False

# 预加载配置：默认禁用，避免阻塞服务启动
# 若需要启动时预加载，设置环境变量 VOICESCRIBE_PRELOAD_MODELS=1
PRELOAD_CONFIG = {
    "funasr": "seaco-paraformer",
}
ENABLE_PRELOAD = os.environ.get("VOICESCRIBE_PRELOAD_MODELS") == "1"


transcription_service = RuntimeTranscriptionService(
    registry_getter=_get_registry_entry,
    speaker_factory=SpeakerDiarizer if DIARIZATION_AVAILABLE else None,
    diarization_available=DIARIZATION_AVAILABLE,
    funasr_runtime_error=FUNASR_RUNTIME.get("error"),
    whisper_available=WHISPER_AVAILABLE,
    whispercpp_available=WHISPERCPP_AVAILABLE,
    funasr_available=FUNASR_AVAILABLE,
    qwen3_asr_available=QWEN3_ASR_AVAILABLE,
    parakeet_available=PARAKEET_AVAILABLE,
    whisper_engine_cls=globals().get("WhisperEngine"),
    whispercpp_engine_cls=globals().get("WhisperCppEngine"),
    funasr_engine_cls=globals().get("FunASREngine"),
    qwen3_asr_engine_cls=globals().get("Qwen3ASREngine"),
    parakeet_engine_cls=globals().get("ParakeetEngine"),
    whisper_cpp_model_dir=WHISPER_CPP_MODEL_DIR,
)


def _get_or_create_diarizer() -> "SpeakerDiarizer":
    return transcription_service.get_or_create_diarizer()


def _speaker_runtime_status() -> dict:
    return transcription_service.speaker_runtime_status()


def ensure_speaker_verification_loaded() -> "SpeakerDiarizer":
    return transcription_service.ensure_speaker_verification_loaded()


def ensure_diarization_loaded() -> "SpeakerDiarizer":
    return transcription_service.ensure_diarization_loaded()


async def ensure_engine_loaded(
    engine: str,
    model: str,
    enable_diarization: bool = False,
    diarization_model: Optional[str] = None,
    speaker_mapping_model: Optional[str] = None,
    load_source: str = "auto_on_demand",
):
    transcription_service.set_mock_mode(MOCK_MODE)
    return await transcription_service.ensure_engine_loaded(
        engine,
        model,
        enable_diarization=enable_diarization,
        diarization_model=diarization_model,
        speaker_mapping_model=speaker_mapping_model,
        load_source=load_source,
    )


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
                await ensure_engine_loaded("funasr", model_name, load_source="startup_preload")
                print(f"[Preload] FunASR ready!")
            elif engine_name == "whisper" and WHISPER_AVAILABLE:
                print(f"[Preload] Loading Whisper model: {model_name}...")
                await ensure_engine_loaded("whisper", model_name, load_source="startup_preload")
                print(f"[Preload] Whisper ready!")
        except Exception as e:
            print(f"[Preload] Failed to load {engine_name}: {e}")


@asynccontextmanager
async def lifespan(_: FastAPI):
    await preload_models()
    try:
        yield
    finally:
        text_processing_task_service.shutdown()
        agent_task_service.shutdown()


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
    raw_text: str
    text: str
    segments: List[dict]
    duration: float
    engine: str
    model: str
    asr_engine: str
    asr_model: str
    diarization_model: Optional[str] = None
    speaker_mapping_model: Optional[str] = None
    speaker_text_alignment_limited: bool = False
    text_processing: Dict[str, Any]
    warnings: List[str] = Field(default_factory=list)


class EngineInfo(BaseModel):
    name: str
    display_name: Optional[str] = None
    description: Optional[str] = None
    asr_models: List[str]
    diarization_models: List[str]
    speaker_mapping_models: List[str]
    default_selection: dict
    loaded_selection: Optional[dict]
    available: bool


class ModelStatus(BaseModel):
    category: str
    engine: str
    model: str
    display_name: str
    engine_scope: List[str]
    available: bool
    downloadable: bool
    requires_token: bool
    downloading: bool
    loaded: bool
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
    raw_text: Optional[str] = None
    text: str
    duration: float
    engine: str
    model: str
    asr_engine: Optional[str] = None
    asr_model: Optional[str] = None
    diarization_model: Optional[str] = None
    speaker_mapping_model: Optional[str] = None
    speaker_entries: List[HistorySpeakerEntry] = []
    summary: Optional[str] = None
    text_processing: Optional[Dict[str, Any]] = None
    target_context: Optional[Dict[str, Any]] = None
    retain_audio: bool = False
    audio_path: Optional[str] = None


class HistoryResponse(BaseModel):
    records: List[HistoryRecordPayload]


class SummaryRequest(BaseModel):
    text: str


class SummaryResponse(BaseModel):
    summary: str


class TextProcessPayload(BaseModel):
    text: str
    profile: str = "raw"
    provider: str = "claude_cli"
    model: str = ""
    base_url: str = ""
    target_language: str = ""
    hotwords: str = ""
    target_context: Optional[Dict[str, Any]] = None
    style_profile: Optional[Dict[str, Any]] = None


class TextProviderProbePayload(BaseModel):
    model: str = ""
    base_url: str = ""


class AgentTaskPayload(BaseModel):
    prompt: str = Field(min_length=1, max_length=20000)
    provider: Literal["claude_cli", "codex_cli", "codex_sdk"] = "codex_cli"
    model: str = Field(default="", max_length=200)
    timeout_seconds: int = Field(default=120, ge=5, le=600)


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
            "text_processing": list(SUPPORTED_PROVIDERS),
            "agent": list(SUPPORTED_AGENT_PROVIDERS),
        },
        "runtime_checks": {
            "torch": TORCH_RUNTIME,
            "funasr": FUNASR_RUNTIME,
        }
    }


@app.get("/engines")
async def list_engines() -> List[EngineInfo]:
    payload = []
    for engine, spec in ENGINE_CATALOG.items():
        loaded = transcription_service.engines.get(engine, {})
        payload.append(
            EngineInfo(
                name=engine,
                display_name=spec.get("display_name"),
                description=spec.get("description"),
                asr_models=list(spec.get("asr_models", [])),
                diarization_models=list(spec.get("diarization_models", [])),
                speaker_mapping_models=list(spec.get("speaker_mapping_models", [])),
                default_selection=spec.get("default_selection", {}),
                loaded_selection={
                    "asrModel": loaded.get("model"),
                    "diarizationModel": loaded.get("diarization_model"),
                    "speakerMappingModel": loaded.get("speaker_mapping_model"),
                } if loaded else None,
                available=bool(spec.get("available")),
            )
        )
    return payload


def _get_model_status(category: str, engine: str, model: str) -> ModelStatus:
    bucket = _category_bucket(category, engine)
    key = f"{category}:{bucket}:{model}"
    download_state = model_downloads.get(key, {})
    spec = _find_model_definition(category, engine, model)
    if not spec:
        raise HTTPException(400, f"Unknown model definition: {category}/{engine}/{model}")

    entry = _get_registry_entry(engine, model, category=category)
    available = False
    size_bytes = None
    loaded = False
    error_message = download_state.get("error")

    if not entry:
        storage_path = _model_storage_path(engine, model, category=category)
        if storage_path and storage_path.exists():
            size_bytes = _path_size(storage_path)
            _set_registry_entry(engine, model, str(storage_path), size_bytes, category=category)
            entry = _get_registry_entry(engine, model, category=category)

    if entry and os.path.exists(entry.get("path", "")):
        entry_path = Path(entry["path"]).resolve()
        size_bytes = _path_size(entry_path)
        available = True
        if int(entry.get("size_bytes", 0) or 0) != size_bytes:
            _set_registry_entry(engine, model, str(entry_path), size_bytes, category=category)
    elif entry and not os.path.exists(entry.get("path", "")):
        _delete_registry_entry(engine, model, category=category)

    if category == "diarization" and model == "funasr_builtin":
        available = FUNASR_AVAILABLE

    if category == "asr":
        loaded = transcription_service.engines.get(engine, {}).get("model") == model
    elif category == "diarization":
        if model == "funasr_builtin":
            loaded = bool(transcription_service.engines.get("funasr", {}).get("diarization"))
        else:
            loaded = bool(transcription_service.diarizer and getattr(transcription_service.diarizer, "diarization_model_id", None))
            if loaded:
                expected_model_id = (
                    DIARIZATION_MODELS.get(model, {}).get("model_id")
                    or DIARIZATION_MODELS.get(model, {}).get("repo_id")
                    or getattr(SpeakerDiarizer, "DIARIZATION_MODEL_MAP", {}).get(model)
                )
                loaded = bool(transcription_service.diarizer.diarization_model_id == expected_model_id)
    elif category == "speaker_mapping":
        loaded = bool(transcription_service.diarizer and getattr(transcription_service.diarizer, "sv_model_id", None))
        if loaded:
            loaded = bool(transcription_service.diarizer.sv_model_id == SPEAKER_MAPPING_MODELS.get(model, {}).get("model_id"))

    if not error_message and not available and not bool(spec.get("downloadable", True)):
        error_message = spec.get("unavailable_reason")

    return ModelStatus(
        category=category,
        engine=engine,
        model=model,
        display_name=spec.get("display_name", model),
        engine_scope=list(spec.get("engine_scope", [engine])),
        available=available,
        downloadable=bool(spec.get("downloadable", True)),
        requires_token=bool(spec.get("requires_token", False)),
        downloading=bool(download_state.get("downloading")),
        loaded=loaded,
        size_bytes=size_bytes,
        downloaded_bytes=download_state.get("downloaded_bytes"),
        error=error_message,
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
    category: str = "asr",
    token: Optional[str] = None,
) -> None:
    key = f"{category}:{_category_bucket(category, engine)}:{model_name}"
    state = model_downloads.setdefault(key, {})
    state["downloading"] = True
    state["error"] = None
    state["downloaded_bytes"] = 0

    stop_event = asyncio.Event()
    if not _is_within_models_dir(target_dir):
        raise RuntimeError(f"Refusing to download outside models root: {target_dir}")
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
            token=token,
        )
        if not _is_within_models_dir(Path(local_dir)):
            raise RuntimeError(f"Downloaded path escaped models root: {local_dir}")

        local_dir_path = Path(local_dir).resolve()
        size_bytes = _path_size(local_dir_path)
        _set_registry_entry(engine, model_name, local_dir, size_bytes, category=category)
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
    category: str = "asr",
    token: Optional[str] = None,
) -> None:
    key = f"{category}:{_category_bucket(category, engine)}:{model_name}"
    state = model_downloads.setdefault(key, {})
    state["downloading"] = True
    state["error"] = None
    state["downloaded_bytes"] = 0

    target_dir.mkdir(parents=True, exist_ok=True)
    if not _is_within_models_dir(target_dir):
        raise RuntimeError(f"Refusing to download outside models root: {target_dir}")
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
            token=token,
        )
        if not _is_within_models_dir(Path(local_file)):
            raise RuntimeError(f"Downloaded file escaped models root: {local_file}")

        size_bytes = _path_size(Path(local_file))
        _set_registry_entry(engine, model_name, local_file, size_bytes, category=category)
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

    key = f"asr:funasr:{model_name}"
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
        if not _is_within_models_dir(Path(local_dir)):
            raise RuntimeError(f"Downloaded path escaped models root: {local_dir}")

        size_bytes = _dir_size(local_dir)
        _set_registry_entry("funasr", model_name, local_dir, size_bytes)
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


async def _download_modelscope_snapshot(category: str, engine: str, model_name: str, model_id: str) -> None:
    key = f"{category}:{_category_bucket(category, engine)}:{model_name}"
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

        downloaded_dir = await asyncio.to_thread(
            snapshot_download,
            model_id,
            cache_dir=str(MODEL_CACHE_DIR),
        )
        if not _is_within_models_dir(Path(downloaded_dir)):
            raise RuntimeError(f"Downloaded path escaped models root: {downloaded_dir}")
        size_bytes = _path_size(Path(downloaded_dir))
        _set_registry_entry(engine, model_name, downloaded_dir, size_bytes, category=category)
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


async def _download_3d_speaker_bundle() -> None:
    key = "diarization:diarization:3d-speaker"
    state = model_downloads.setdefault(key, {})
    state["downloading"] = True
    state["error"] = None
    state["downloaded_bytes"] = 0

    bundle_root = _model_storage_path("diarization", "3d-speaker", category="diarization")
    if bundle_root is None:
        raise RuntimeError("3D-Speaker bundle root is not configured")
    if not _is_within_models_dir(bundle_root):
        raise RuntimeError(f"Refusing to download outside models root: {bundle_root}")

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

        bundle_root.mkdir(parents=True, exist_ok=True)
        manifest = {
            "model": "3d-speaker",
            "source": "modelscope/3D-Speaker official diarization recipe",
            "components": [],
        }

        for component in THREE_D_SPEAKER_COMPONENTS:
            downloaded_dir = await asyncio.to_thread(
                snapshot_download,
                component["model_id"],
                revision=component.get("revision"),
                cache_dir=str(bundle_root),
            )
            downloaded_path = Path(downloaded_dir).resolve()
            if not _is_within_models_dir(downloaded_path):
                raise RuntimeError(f"Downloaded path escaped models root: {downloaded_path}")
            manifest["components"].append(
                {
                    "name": component["name"],
                    "model_id": component["model_id"],
                    "revision": component.get("revision"),
                    "path": str(downloaded_path),
                }
            )

        manifest_path = (bundle_root / "3d-speaker.bundle.json").resolve()
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        size_bytes = _path_size(bundle_root)
        _set_registry_entry("diarization", "3d-speaker", str(bundle_root), size_bytes, category="diarization")
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
    models = []
    for category, engine, model_name in _iter_engine_models():
        models.append(_get_model_status(category, engine, model_name))
    return models


@app.post("/models/download")
async def download_model(
    category: str = Form("asr"),
    engine: str = Form(...),
    model: str = Form(...),
    token: Optional[str] = Form(None),
):
    spec = _find_model_definition(category, engine, model)
    if not spec:
        raise HTTPException(400, f"Unknown model definition: {category}/{engine}/{model}")

    status = _get_model_status(category, engine, model)
    if status.available or status.downloading:
        return {"status": "already", "category": category, "engine": engine, "model": model}

    if not status.downloadable:
        raise HTTPException(400, spec.get("unavailable_reason") or f"Download not supported for model: {category}/{model}")

    if category == "asr" and engine == "funasr":
        if not FUNASR_AVAILABLE:
            raise HTTPException(400, "FunASR engine not available")
        asyncio.create_task(_download_funasr_model(model))
    elif category == "asr" and engine == "whisper":
        asyncio.create_task(_download_whisper_model(model))
    elif category == "asr" and engine == "whispercpp":
        asyncio.create_task(_download_whispercpp_model(model))
    elif category == "asr" and engine == "parakeet":
        asyncio.create_task(_download_parakeet_model(model))
    elif category == "asr" and engine == "qwen3_asr":
        asyncio.create_task(_download_hf_snapshot("qwen3_asr", model, QWEN3_ASR_MODEL_REPOS[model], _model_storage_path(engine, model, category="asr")))
    elif category == "diarization":
        if model in {"campplus-diarization", "sond-diarization"}:
            asyncio.create_task(_download_modelscope_snapshot(category, engine, model, spec["model_id"]))
        elif model == "3d-speaker":
            asyncio.create_task(_download_3d_speaker_bundle())
        else:
            raise HTTPException(400, f"Download not supported for diarization model: {model}")
    elif category == "speaker_mapping":
        model_id = spec.get("model_id")
        if not model_id:
            raise HTTPException(400, f"Unknown speaker mapping source: {model}")
        asyncio.create_task(_download_modelscope_snapshot(category, engine, model, model_id))
    else:
        raise HTTPException(400, f"Download not supported for model: {category}/{engine}/{model}")
    return {"status": "started", "category": category, "engine": engine, "model": model}


@app.post("/models/delete")
async def delete_model(category: str = Form("asr"), engine: str = Form(...), model: str = Form(...)):
    spec = _find_model_definition(category, engine, model)
    if not spec:
        raise HTTPException(400, f"Unknown model definition: {category}/{engine}/{model}")

    entry = _get_registry_entry(engine, model, category=category)
    if entry and os.path.exists(entry.get("path", "")):
        target_path = Path(entry["path"])
        if target_path.is_file():
            target_path.unlink(missing_ok=True)
        else:
            shutil.rmtree(target_path, ignore_errors=True)
    else:
        fallback_path = _model_storage_path(engine, model, category=category)
        if fallback_path and fallback_path.exists():
            if fallback_path.is_file():
                fallback_path.unlink(missing_ok=True)
            else:
                shutil.rmtree(fallback_path, ignore_errors=True)
    _delete_registry_entry(engine, model, category=category)
    _reset_download_state(engine, model, category=category)
    return {"status": "deleted", "category": category, "engine": engine, "model": model}


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

    if MOCK_MODE:
        return SummaryResponse(summary=_fallback_summary(text))

    result = text_processing_service.summarize(text, timeout_seconds=5)
    if result.status == "processed":
        return SummaryResponse(summary=result.text)
    return SummaryResponse(summary=_fallback_summary(text))


@app.post("/text/process")
async def process_text(payload: TextProcessPayload) -> Dict[str, Any]:
    request = _text_processing_request_from_payload(payload)
    processing = await asyncio.to_thread(
        text_processing_service.process,
        request,
    )
    return processing.to_dict()


def _text_processing_request_from_payload(payload: TextProcessPayload) -> TextProcessingRequest:
    return TextProcessingRequest(
        text=payload.text,
        profile=payload.profile,
        provider=payload.provider,
        model=payload.model,
        base_url=payload.base_url,
        target_language=payload.target_language,
        hotwords=tuple(word.strip() for word in payload.hotwords.split(",") if word.strip()),
        target_context=payload.target_context,
        style_profile=payload.style_profile,
    )


@app.post("/text/tasks")
async def start_text_processing_task(payload: TextProcessPayload) -> Dict[str, Any]:
    return text_processing_task_service.start(_text_processing_request_from_payload(payload))


@app.get("/text/tasks/{task_id}")
async def get_text_processing_task(task_id: str) -> Dict[str, Any]:
    task = text_processing_task_service.get(task_id)
    if task is None:
        raise HTTPException(404, "Text processing task not found")
    return task


@app.delete("/text/tasks/{task_id}")
async def cancel_text_processing_task(task_id: str) -> Dict[str, Any]:
    task = text_processing_task_service.cancel(task_id)
    if task is None:
        raise HTTPException(404, "Text processing task not found")
    return task


@app.post("/text/providers/probe")
async def probe_text_providers(payload: TextProviderProbePayload) -> Dict[str, Any]:
    providers = await asyncio.to_thread(
        text_processing_service.probe_providers,
        model=payload.model,
        base_url=payload.base_url,
    )
    return {"providers": [provider.to_dict() for provider in providers]}


@app.post("/agent/tasks")
async def start_agent_task(payload: AgentTaskPayload) -> Dict[str, Any]:
    if not payload.prompt.strip():
        raise HTTPException(422, "Agent prompt must not be empty")
    return agent_task_service.start(
        AgentRequest(
            prompt=payload.prompt,
            provider=payload.provider,
            model=payload.model,
            timeout_seconds=payload.timeout_seconds,
        )
    )


@app.get("/agent/tasks/{task_id}")
async def get_agent_task(task_id: str) -> Dict[str, Any]:
    task = agent_task_service.get(task_id)
    if task is None:
        raise HTTPException(404, "Agent task not found")
    return task


@app.delete("/agent/tasks/{task_id}")
async def cancel_agent_task(task_id: str) -> Dict[str, Any]:
    task = agent_task_service.cancel(task_id)
    if task is None:
        raise HTTPException(404, "Agent task not found")
    return task


@app.post("/agent/providers/probe")
async def probe_agent_providers() -> Dict[str, Any]:
    providers = await asyncio.to_thread(agent_service.probe_providers)
    return {"providers": [provider.to_dict() for provider in providers]}


@app.post("/load")
async def load_engine(
    engine: Optional[str] = Form(None),
    model: Optional[str] = Form(None),
    asr_engine: Optional[str] = Form(None),
    asr_model: Optional[str] = Form(None),
    diarization_model: Optional[str] = Form(None),
    speaker_mapping_model: Optional[str] = Form(None),
    load_source: Optional[str] = Form(None),
    enable_diarization: Optional[bool] = Form(None),
    request: Request = None,
):
    engine = asr_engine or engine
    model = asr_model or model
    if engine is None or model is None:
        if request is not None:
            engine = engine or request.query_params.get("engine") or request.query_params.get("asr_engine")
            model = model or request.query_params.get("model") or request.query_params.get("asr_model")
            diarization_model = diarization_model or request.query_params.get("diarization_model")
            speaker_mapping_model = speaker_mapping_model or request.query_params.get("speaker_mapping_model")
            load_source = load_source or request.query_params.get("load_source")
    if engine is None or model is None:
        raise HTTPException(422, "Missing engine/model")
    resolved_enable_diarization = bool(enable_diarization) if enable_diarization is not None else bool(diarization_model)
    _validate_engine_selection(engine, model, diarization_model, speaker_mapping_model)

    await ensure_engine_loaded(
        engine,
        model,
        resolved_enable_diarization,
        diarization_model=diarization_model,
        speaker_mapping_model=speaker_mapping_model,
        load_source=load_source or "manual_preload",
    )
    return {
        "status": "loaded",
        "engine": engine,
        "model": model,
        "diarization_model": diarization_model,
        "speaker_mapping_model": speaker_mapping_model,
    }


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
    asr_engine: Optional[str] = Form(None),
    asr_model: Optional[str] = Form(None),
    diarization_model: Optional[str] = Form(None),
    speaker_mapping_model: Optional[str] = Form(None),
    language: str = Form("zh"),
    enable_diarization: bool = Form(False),
    hotwords: str = Form(""),
    text_processing_profile: str = Form("raw"),
    text_processing_provider: str = Form("claude_cli"),
    text_processing_model: str = Form(""),
    text_processing_base_url: str = Form(""),
    text_processing_target_language: str = Form(""),
    target_app_kind: Optional[str] = Form(None),
    target_executable_name: Optional[str] = Form(None),
    target_captured_at: Optional[str] = Form(None),
    defer_text_processing: bool = Form(False),
    enable_ai_refine: Optional[bool] = Form(None),
) -> TranscribeResult:
    """转录音频文件"""
    suffix = Path(audio.filename).suffix or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await audio.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        result_warnings: List[str] = []
        target_context = (
            {
                "app_kind": target_app_kind,
                "executable_name": target_executable_name,
                "captured_at": target_captured_at,
            }
            if target_app_kind
            else None
        )
        engine = asr_engine or engine
        model = asr_model or model
        _validate_engine_selection(engine, model, diarization_model, speaker_mapping_model)
        print(
            f"[Transcribe] Request received filename={audio.filename or ''} engine={engine} model={model} diarization_model={diarization_model} speaker_mapping_model={speaker_mapping_model} language={language} diarization={enable_diarization} text_profile={text_processing_profile} text_provider={text_processing_provider} defer_text_processing={defer_text_processing} size_bytes={len(content)}"
        )

        if MOCK_MODE:
            await ensure_engine_loaded(
                engine,
                model,
                bool(enable_diarization),
                diarization_model=diarization_model,
                speaker_mapping_model=speaker_mapping_model,
                load_source="auto_on_demand",
            )
            result = mock_transcribe(tmp_path, language)
            warning = _apply_text_processing(
                result,
                profile="raw" if defer_text_processing else text_processing_profile,
                provider=text_processing_provider,
                model=text_processing_model,
                base_url=text_processing_base_url,
                target_language=text_processing_target_language,
                hotwords=hotwords,
                target_context=target_context,
                legacy_enable_ai_refine=bool(enable_ai_refine),
            )
            if warning:
                result_warnings.append(warning)
            return TranscribeResult(
                raw_text=result["raw_text"],
                text=result["text"],
                segments=result.get("segments", []),
                duration=result.get("duration", 0),
                engine=f"{engine} (mock)",
                model=model,
                asr_engine=engine,
                asr_model=model,
                diarization_model=diarization_model if enable_diarization else None,
                speaker_mapping_model=speaker_mapping_model if enable_diarization else None,
                speaker_text_alignment_limited=bool(
                    result.get("speaker_text_alignment_limited", False) or engine == "parakeet"
                ),
                text_processing=result["text_processing"],
                warnings=result_warnings,
            )

        entry = await ensure_engine_loaded(
            engine,
            model,
            bool(enable_diarization),
            diarization_model=diarization_model,
            speaker_mapping_model=speaker_mapping_model,
            load_source="auto_on_demand",
        )
        eng = entry["engine"]

        print(
            f"[Transcribe] Engine ready engine={engine} model={model} load_target={entry.get('load_target')} diarization={entry.get('diarization', False)} diarization_model={diarization_model} speaker_mapping_model={speaker_mapping_model}"
        )
        print(
            f"[Transcribe] Start engine={engine} model={model} diarization={enable_diarization} diarization_model={diarization_model} speaker_mapping_model={speaker_mapping_model} text_profile={text_processing_profile} text_provider={text_processing_provider}"
        )

        if engine == "funasr" and hotwords:
            print(f"[Transcribe] FunASR with hotwords: {hotwords}")
            result = eng.transcribe(tmp_path, language=language, hotwords=hotwords)
        else:
            print(f"[Transcribe] Engine={engine}, hotwords={hotwords or '(none)'}")
            result = eng.transcribe(tmp_path, language=language)
            if engine == "parakeet":
                print("[Transcribe] Parakeet current round uses limited speaker-text alignment path")

        diarization_done = False
        if enable_diarization:
            has_transcribed_content = bool((result.get("text") or "").strip()) or bool(result.get("segments"))
            builtin_diarization = _extract_builtin_speaker_labels(result)
            if engine == "funasr" and diarization_model == "funasr_builtin" and builtin_diarization:
                print(
                    f"[Speaker] Using FunASR built-in speaker labels: segments={len(builtin_diarization)}"
                )
                diarization_done = True
                if DIARIZATION_AVAILABLE:
                    speaker_service = _get_or_create_diarizer()
                    if speaker_service.speakers:
                        speaker_service.ensure_speaker_verification_loaded(speaker_mapping_model)
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
                if not has_transcribed_content:
                    print("[Speaker] Skip diarization: empty transcription result")
                    diarization_done = True
                else:
                    if engine == "funasr" and diarization_model == "funasr_builtin":
                        raise HTTPException(400, "FunASR built-in diarization produced no speaker labels for this result")
                    if not DIARIZATION_AVAILABLE:
                        raise HTTPException(400, "Speaker diarization helper not available")

                    speaker_service = transcription_service.ensure_diarization_loaded(diarization_model)
                    if speaker_service.speakers:
                        speaker_service = transcription_service.ensure_speaker_verification_loaded(speaker_mapping_model)
                        print("[Speaker] Using external diarization with speaker verification mapping")
                    else:
                        print("[Speaker] Using external diarization without registered speaker mapping")

                    speakers = speaker_service.diarize(tmp_path)
                    print(f"[Speaker] External diarization produced {len(speakers)} segments")
                    if speakers:
                        result = speaker_service.assign_speakers(result, speakers, audio_path=tmp_path)
                    else:
                        print("[Speaker] Skip diarization assignment: no effective speaker segments")
                    diarization_done = True

            if not diarization_done:
                raise HTTPException(500, "Speaker diarization requested but no diarization result was produced")

        warning = _apply_text_processing(
            result,
            profile="raw" if defer_text_processing else text_processing_profile,
            provider=text_processing_provider,
            model=text_processing_model,
            base_url=text_processing_base_url,
            target_language=text_processing_target_language,
            hotwords=hotwords,
            target_context=target_context,
            legacy_enable_ai_refine=bool(enable_ai_refine),
        )
        if warning:
            result_warnings.append(warning)

        print(
            f"[Transcribe] Completed engine={engine} model={model} text_length={len(result.get('text', ''))} segments={len(result.get('segments', []))} duration={result.get('duration', 0)}"
        )
        return TranscribeResult(
            raw_text=result["raw_text"],
            text=result["text"],
            segments=result.get("segments", []),
            duration=result.get("duration", 0),
            engine=engine,
            model=model,
            asr_engine=engine,
            asr_model=model,
            diarization_model=diarization_model if enable_diarization else None,
            speaker_mapping_model=speaker_mapping_model if enable_diarization else None,
            speaker_text_alignment_limited=bool(result.get("speaker_text_alignment_limited", False)),
            text_processing=result["text_processing"],
            warnings=result_warnings,
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
    
    if engine_name not in transcription_service.engines:
        eng = WhisperEngine()
        eng.load(model)
        transcription_service.engines[engine_name] = {"engine": eng, "model": model}

    eng = transcription_service.engines[engine_name]["engine"]
    
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

    speaker_service = transcription_service.diarizer if transcription_service.diarizer is not None else SpeakerDiarizer()
    return {"speakers": speaker_service.list_speakers()}


@app.delete("/speakers/{speaker_id}")
async def delete_speaker(speaker_id: str):
    """删除说话人"""
    if MOCK_MODE:
        return {"status": "deleted (mock)", "speaker_id": speaker_id}

    if not DIARIZATION_AVAILABLE:
        raise HTTPException(400, f"Speaker features not available: {FUNASR_RUNTIME.get('error') or 'runtime probe failed'}")

    target_diarizer = transcription_service.diarizer if transcription_service.diarizer else SpeakerDiarizer()
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
            "text_processing": list(SUPPORTED_PROVIDERS),
            "agent": list(SUPPORTED_AGENT_PROVIDERS),
        },
        "loaded_engines": {
            name: {
                "model": entry.get("model"),
                "diarization": bool(entry.get("diarization", False)),
                "load_target": entry.get("load_target"),
            }
            for name, entry in transcription_service.engines.items()
        },
        "speaker_runtime": _speaker_runtime_status(),
        "runtime_checks": {
            "torch": TORCH_RUNTIME,
            "funasr": FUNASR_RUNTIME,
        },
        "cache_paths": {
            "model_root": str(MODEL_CACHE_DIR),
            "huggingface_root": str(HF_HOME_DIR),
            "jieba_cache_file": str(JIEBA_CACHE_FILE),
        },
        "cache_migration": MIGRATION_MESSAGES[-20:],
    }


def main():
    global MOCK_MODE
    
    parser = argparse.ArgumentParser(description="VoiceScribe Backend Server")
    parser.add_argument("--mock", action="store_true", help="Run in mock mode (no ASR engines)")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8765, help="Port to bind (default: 8765)")
    args = parser.parse_args()
    
    MOCK_MODE = args.mock or (not WHISPER_AVAILABLE and not WHISPERCPP_AVAILABLE and not FUNASR_AVAILABLE and not PARAKEET_AVAILABLE)
    transcription_service.set_mock_mode(MOCK_MODE)

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
        print(f"   Text processing providers: {', '.join(SUPPORTED_PROVIDERS)}")
        print("=" * 50)
    
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
