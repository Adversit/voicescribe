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

import numpy as np

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

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

WHISPER_MODELS = ["tiny", "base", "small", "medium", "large-v2", "large-v3"]
WHISPERCPP_MODELS = ["tiny", "base", "small", "medium", "large"]
FUNASR_MODELS = ["seaco-paraformer", "paraformer-zh", "paraformer-zh-streaming", "sensevoice-small"]
PARAKEET_MODELS = ["parakeet-ctc-1.1b", "parakeet-tdt-1.1b"]

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

# 模型缓存目录（用于下载/管理模型权重）
MODEL_CACHE_DIR = os.environ.get("VOICESCRIBE_MODEL_DIR")
if not MODEL_CACHE_DIR:
    if sys.platform == 'win32':
        # Windows default cache path
        MODEL_CACHE_DIR = os.path.join(Path.home(), ".cache", "modelscope", "hub", "models")
    else:
        # macOS
        MODEL_CACHE_DIR = os.path.join(
            Path.home(), "Library", "Application Support", "VoiceScribe", "models"
        )

# Keep ModelScope cache root at ".../modelscope" to avoid ".../hub/models/models".
def _derive_modelscope_cache_root(model_dir: str) -> str:
    p = Path(model_dir)
    # If model_dir ends with ".../hub/models", return parent of "hub".
    if len(p.parts) >= 2 and p.parts[-2].lower() == "hub" and p.parts[-1].lower() == "models":
        return str(p.parent.parent)
    return str(p)

os.environ.setdefault("MODELSCOPE_CACHE", _derive_modelscope_cache_root(MODEL_CACHE_DIR))

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
            "funasr": FUNASR_AVAILABLE,
            "diarization": DIARIZATION_AVAILABLE,
            "ai_refine": AI_REFINE_AVAILABLE,
        },
        "meeting": True,
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
            requires_gpu=True,  # 仅支持 GPU
        ),
    ]
    return available


def _get_model_status(engine: str, model: str) -> ModelStatus:
    key = f"{engine}:{model}"
    download_state = model_downloads.get(key, {})

    entry = _get_registry_entry(engine, model)
    available = False
    size_bytes = None

    if entry and os.path.exists(entry.get("path", "")):
        available = True
        size_bytes = entry.get("size_bytes")
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


def _all_managed_models() -> dict:
    return {
        "whisper": WHISPER_MODELS,
        "whispercpp": WHISPERCPP_MODELS,
        "funasr": FUNASR_MODELS,
        "parakeet": PARAKEET_MODELS,
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

    entry = _get_registry_entry(engine, model)
    if entry and os.path.exists(entry.get("path", "")):
        path_to_delete = entry["path"]
        if os.path.isdir(path_to_delete):
            shutil.rmtree(path_to_delete, ignore_errors=True)
        else:
            try:
                os.remove(path_to_delete)
            except FileNotFoundError:
                pass
    _delete_registry_entry(engine, model)
    return {"status": "deleted", "engine": engine, "model": model}


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
    """预加载指定引擎和模型"""
    global engines
    
    if MOCK_MODE:
        engines[engine] = {"engine": None, "model": model}
        return {"status": "loaded (mock)", "engine": engine, "model": model}
    
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
        eng.load(model, enable_diarization=bool(enable_diarization))
        engines["funasr"] = {"engine": eng, "model": model, "diarization": bool(enable_diarization)}
    elif engine == "parakeet":
        if not PARAKEET_AVAILABLE:
            raise HTTPException(400, "Parakeet engine not available. Requires NVIDIA GPU and NeMo toolkit.")
        eng = ParakeetEngine()
        eng.load(model)
        engines["parakeet"] = {"engine": eng, "model": model}
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
    global engines, diarizer
    
    # Save uploaded file
    suffix = Path(audio.filename).suffix or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await audio.read()
        tmp.write(content)
        tmp_path = tmp.name
    
    try:
        # Mock 模式
        if MOCK_MODE:
            result = mock_transcribe(tmp_path, language)
            # AI 文本优化（mock 模式也支持）
            if enable_ai_refine and AI_REFINE_AVAILABLE:
                refiner = AIRefiner()
                hotwords_list = [w.strip() for w in hotwords.split(",") if w.strip()]
                result["text"] = refiner.refine_sync(result["text"], hotwords_list)
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
        
        # Get or create engine
        if engine not in engines or engines[engine]["model"] != model:
            await load_engine(engine, model, enable_diarization=enable_diarization if engine == "funasr" else None)
        elif engine == "funasr" and enable_diarization:
            # 如果需要说话人识别但当前引擎未开启，则重新加载
            if not engines.get("funasr", {}).get("diarization", False):
                await load_engine(engine, model, enable_diarization=True)
        
        eng = engines[engine]["engine"]

        # Transcribe (pass hotwords for FunASR)
        if engine == "funasr" and hotwords:
            print(f"[Transcribe] FunASR with hotwords: {hotwords}")
            result = eng.transcribe(tmp_path, language=language, hotwords=hotwords)
        else:
            print(f"[Transcribe] Engine={engine}, hotwords={hotwords or '(none)'}")
            result = eng.transcribe(tmp_path, language=language)
        
        # Speaker diarization if enabled (FunASR 内置 spk_model 时可跳过)
        diarization_done = False
        if engine == "funasr" and enable_diarization:
            if engines.get("funasr", {}).get("diarization", False):
                # 如果 FunASR 已给出 speaker 标签，尝试将标签映射为已注册说话人姓名
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
                        diarization_done = True
                        if diarizer is None:
                            diarizer = SpeakerDiarizer()
                        if diarizer.speakers and diarizer.sv_model is None:
                            diarizer.load(load_diarization=False)
                        result = diarizer.assign_speakers(result, diarization_list, audio_path=tmp_path)
                except Exception as e:
                    print(f"[Speaker] Name mapping failed: {e}")

        if enable_diarization and DIARIZATION_AVAILABLE and not diarization_done:
            if diarizer is None:
                diarizer = SpeakerDiarizer()
                diarizer.load()

            speakers = diarizer.diarize(tmp_path)
            result = diarizer.assign_speakers(result, speakers, audio_path=tmp_path)

        # AI 文本优化
        if enable_ai_refine and AI_REFINE_AVAILABLE:
            refiner = AIRefiner()
            hotwords_list = [w.strip() for w in hotwords.split(",") if w.strip()]
            print(f"[AI Refine] Hotwords: {hotwords_list}")
            print(f"[AI Refine] Original: {result['text'][:100]}...")
            result["text"] = refiner.refine_sync(result["text"], hotwords_list)
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
    """WebSocket streaming ASR:
    - text: {"action":"start","engine","model","language","hotwords","enable_ai_refine"}
    - binary: PCM16 mono 16k chunks
    - text: {"action":"end"}
    """
    await websocket.accept()

    def pcm16_to_wav_file(pcm_bytes: bytes, sample_rate: int = 16000, channels: int = 1) -> str:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
            tmp_path = tmp.name
        with wave.open(tmp_path, "wb") as wf:
            wf.setnchannels(channels)
            wf.setsampwidth(2)
            wf.setframerate(sample_rate)
            wf.writeframes(pcm_bytes)
        return tmp_path

    async def transcribe_pcm(pcm_bytes: bytes, engine: str, model: str, language: str, hotwords: str) -> dict:
        global engines
        if not pcm_bytes:
            return {"text": "", "segments": [], "duration": 0}

        if engine == "whisper" and not WHISPER_AVAILABLE:
            raise RuntimeError("Whisper engine not available")
        if engine == "whispercpp" and not WHISPERCPP_AVAILABLE:
            raise RuntimeError("Whisper.cpp engine not available")
        if engine == "funasr" and not FUNASR_AVAILABLE:
            raise RuntimeError("FunASR engine not available")
        if engine == "parakeet" and not PARAKEET_AVAILABLE:
            raise RuntimeError("Parakeet engine not available")

        if engine not in engines or engines[engine]["model"] != model:
            await load_engine(engine, model)
        eng = engines[engine]["engine"]

        wav_path = pcm16_to_wav_file(pcm_bytes)
        try:
            if engine == "funasr" and hotwords:
                result = eng.transcribe(wav_path, language=language, hotwords=hotwords)
            else:
                result = eng.transcribe(wav_path, language=language)
            return result
        finally:
            try:
                os.unlink(wav_path)
            except Exception:
                pass

    cfg = {
        "engine": "funasr",
        "model": "seaco-paraformer",
        "language": "zh",
        "hotwords": "",
        "enable_ai_refine": False,
    }
    # Streaming policy: process one partial every 30s chunk (16kHz, 16-bit mono).
    chunk_duration = 30
    overlap_duration = 3
    sample_rate = 16000
    bytes_per_sample = 2
    chunk_size = chunk_duration * sample_rate * bytes_per_sample
    overlap_size = overlap_duration * sample_rate * bytes_per_sample
    chunk_buffer = bytearray()
    full_pcm = bytearray()

    try:
        while True:
            msg = await websocket.receive()

            if msg.get("type") == "websocket.disconnect":
                break

            text_payload = msg.get("text")
            if text_payload is not None:
                try:
                    payload = json.loads(text_payload)
                except Exception:
                    await websocket.send_json({"type": "error", "message": "Invalid JSON payload"})
                    continue

                action = payload.get("action")
                if action == "start":
                    cfg["engine"] = payload.get("engine", cfg["engine"])
                    cfg["model"] = payload.get("model", cfg["model"])
                    cfg["language"] = payload.get("language", cfg["language"])
                    cfg["hotwords"] = payload.get("hotwords", cfg["hotwords"])
                    cfg["enable_ai_refine"] = bool(payload.get("enable_ai_refine", cfg["enable_ai_refine"]))
                    await websocket.send_json({"type": "started", **cfg})
                    continue

                if action == "ping":
                    await websocket.send_json({"type": "pong"})
                    continue

                if action == "end":
                    final_result = await transcribe_pcm(
                        bytes(full_pcm),
                        cfg["engine"],
                        cfg["model"],
                        cfg["language"],
                        cfg["hotwords"],
                    )
                    # AI refine runs once after the whole recording is converted to text.
                    if cfg["enable_ai_refine"] and AI_REFINE_AVAILABLE:
                        refiner = AIRefiner()
                        hotwords_list = [w.strip() for w in cfg["hotwords"].split(",") if w.strip()]
                        final_result["text"] = refiner.refine_sync(final_result.get("text", ""), hotwords_list)
                    await websocket.send_json({
                        "type": "final",
                        "text": final_result.get("text", ""),
                        "segments": final_result.get("segments", []),
                        "duration": final_result.get("duration", 0),
                        "engine": cfg["engine"],
                        "model": cfg["model"],
                    })
                    break

                await websocket.send_json({"type": "error", "message": f"Unknown action: {action}"})
                continue

            chunk = msg.get("bytes")
            if chunk is None:
                continue
            chunk_buffer.extend(chunk)
            full_pcm.extend(chunk)

            while len(chunk_buffer) >= chunk_size:
                pcm_chunk = bytes(chunk_buffer[:chunk_size])
                if overlap_size > 0:
                    keep_from = max(0, chunk_size - overlap_size)
                    chunk_buffer = bytearray(chunk_buffer[keep_from:])
                else:
                    del chunk_buffer[:chunk_size]
                partial_result = await transcribe_pcm(
                    pcm_chunk,
                    cfg["engine"],
                    cfg["model"],
                    cfg["language"],
                    cfg["hotwords"],
                )
                await websocket.send_json({
                    "type": "partial",
                    "text": partial_result.get("text", ""),
                    "segments": partial_result.get("segments", []),
                    "duration": partial_result.get("duration", 0),
                    "engine": cfg["engine"],
                    "model": cfg["model"],
                })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


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


@app.websocket("/meeting")
async def meeting_ws(websocket: WebSocket):
    """WebSocket endpoint for meeting recording with speaker diarization.

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

    async def _summary_loop(sess, ws):
        """Periodically generate summaries."""
        while True:
            await asyncio.sleep(sess.config.summary_interval)
            if sess.summarizer.should_summarize():
                result = await sess.summarizer.generate_summary()
                if result:
                    sess.running_summary = result.content
                    await ws.send_json(result.to_dict())

    await websocket.accept()
    session = None
    summary_task = None

    try:
        while True:
            data = await websocket.receive()

            if "text" in data:
                msg = json.loads(data["text"])
                action = msg.get("action")

                if action == "start":
                    config = SessionConfig(
                        engine=msg.get("engine", "firered"),
                        model=msg.get("model", "firered-aed-l"),
                        speakers_enabled=msg.get("speakers_enabled", True),
                        hotwords=msg.get("hotwords", ""),
                        enable_ai_refine=msg.get("enable_ai_refine", True),
                        summary_interval=msg.get("summary_interval", 120),
                        llm_provider=msg.get("llm_provider", "claude_cli"),
                        llm_model=msg.get("llm_model", "haiku"),
                    )
                    session = MeetingSession(config)

                    # Set ASR engine
                    engine_name = config.engine
                    if engine_name in engines and engines[engine_name].get("engine"):
                        session.set_asr_engine(engines[engine_name]["engine"])
                    elif MOCK_MODE:
                        session.set_asr_engine(_MockASREngine())
                    else:
                        await websocket.send_json({
                            "type": "error",
                            "message": f"Engine '{engine_name}' not loaded"
                        })
                        continue

                    # Load registered speakers
                    if config.speakers_enabled and diarizer:
                        try:
                            speakers_data = []
                            for spk in diarizer.list_speakers():
                                emb = diarizer.load_speaker_embedding(spk["id"])
                                if emb is not None:
                                    speakers_data.append({
                                        "id": spk["id"],
                                        "name": spk["name"],
                                        "embedding": emb,
                                    })
                            session.load_registered_speakers(speakers_data)
                        except Exception as e:
                            logger.warning(f"[Meeting] Failed to load speakers: {e}")

                    await websocket.send_json({
                        "type": "started",
                        "session_id": session.session_id,
                        "engine": config.engine,
                        "speakers_enabled": config.speakers_enabled,
                    })

                    # Start background summary loop
                    summary_task = asyncio.create_task(
                        _summary_loop(session, websocket)
                    )

                elif action == "end":
                    if summary_task:
                        summary_task.cancel()
                        summary_task = None
                    if session:
                        session_data = session.get_session_data()
                        await websocket.send_json({
                            "type": "session_end",
                            "total_utterances": len(session.utterances),
                            "duration": session_data["duration"],
                            "session_data": session_data,
                        })
                        session.cleanup()
                        session = None
                    break

            elif "bytes" in data:
                # Binary PCM audio data
                if session is None:
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
                            utterance = await session.process_audio_segment(
                                segment
                            )
                            await websocket.send_json(utterance.to_dict())

                            # Notify active speaker
                            await websocket.send_json({
                                "type": "speaker_active",
                                "speaker": utterance.speaker,
                                "speaker_id": utterance.speaker_id,
                            })

                            # Feed to summarizer
                            session.summarizer.add_utterance(utterance)

                            # Refine asynchronously
                            if session.config.enable_ai_refine:
                                refined = await session.refine_utterance(utterance)
                                if refined:
                                    await websocket.send_json({
                                        "type": "utterance_refined",
                                        "utterance_id": utterance.id,
                                        "text": refined,
                                    })
                        except Exception as e:
                            logger.error(f"[Meeting] Processing error: {e}")
                            await websocket.send_json({
                                "type": "error",
                                "message": str(e),
                            })

    except WebSocketDisconnect:
        if summary_task:
            summary_task.cancel()
        if session:
            session.cleanup()
    except Exception as e:
        logger.error(f"[Meeting] WebSocket error: {e}")
        if summary_task:
            summary_task.cancel()
        if session:
            session.cleanup()


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
        diarizer = SpeakerDiarizer()
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
        temp_diarizer = SpeakerDiarizer()
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
        }
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
        print(f"   Diarization: {'✓' if DIARIZATION_AVAILABLE else '✗'}")
        print(f"   AI Refine:   {'✓' if AI_REFINE_AVAILABLE else '✗'}")
        print("=" * 50)
    
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
