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
from pathlib import Path
from typing import Optional, List
from datetime import datetime
import argparse
import importlib.util
import shutil
import json

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, WebSocket, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
from config import (
    CONFIG_DIR,
    MODEL_CACHE_DIR,
    MODEL_REGISTRY_PATH,
    MODELSCOPE_CACHE,
    WHISPER_CPP_MODEL_DIR,
    ensure_dirs,
    find_whisper_cli,
)

def _module_available(name: str) -> bool:
    return importlib.util.find_spec(name) is not None


def _whispercpp_cli_available() -> bool:
    return find_whisper_cli() is not None


def _whispercpp_model_available() -> bool:
    return (WHISPER_CPP_MODEL_DIR / "ggml-base.bin").exists()


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

# 设置运行时目录
os.environ.setdefault("MODELSCOPE_CACHE", MODELSCOPE_CACHE)
os.environ.setdefault("VOICESCRIBE_CONFIG_DIR", str(CONFIG_DIR))
ensure_dirs()

# 下载状态缓存
model_downloads = {}

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
    return _dir_size(str(MODEL_CACHE_DIR))

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
        }
    }


@app.get("/engines")
async def list_engines() -> List[EngineInfo]:
    """列出可用的 ASR 引擎"""
    available = [
        EngineInfo(
            name="whisper",
            models=["tiny", "base", "small", "medium", "large-v2", "large-v3"],
            loaded_model=engines.get("whisper", {}).get("model"),
            available=WHISPER_AVAILABLE,
        ),
        EngineInfo(
            name="whispercpp",
            models=["tiny", "base", "small", "medium", "large"],
            loaded_model=engines.get("whispercpp", {}).get("model"),
            available=WHISPERCPP_AVAILABLE,
        ),
        EngineInfo(
            name="funasr",
            models=["seaco-paraformer", "paraformer-zh", "sensevoice-small"],
            loaded_model=engines.get("funasr", {}).get("model"),
            available=FUNASR_AVAILABLE,
        ),
        EngineInfo(
            name="parakeet",
            models=["parakeet-ctc-1.1b", "parakeet-tdt-1.1b"],
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


@app.get("/models")
async def list_models() -> List[ModelStatus]:
    """列出可用模型（当前仅管理 FunASR 模型缓存）"""
    models = []
    for model_name in FunASREngine.MODELS.keys():
        models.append(_get_model_status("funasr", model_name))
    return models


@app.post("/models/download")
async def download_model(engine: str = Form(...), model: str = Form(...)):
    if engine != "funasr":
        raise HTTPException(400, "Only FunASR models are supported for download")
    if not FUNASR_AVAILABLE:
        raise HTTPException(400, "FunASR engine not available")

    status = _get_model_status(engine, model)
    if status.available or status.downloading:
        return {"status": "already", "engine": engine, "model": model}

    asyncio.create_task(_download_funasr_model(model))
    return {"status": "started", "engine": engine, "model": model}


@app.post("/models/delete")
async def delete_model(engine: str = Form(...), model: str = Form(...)):
    if engine != "funasr":
        raise HTTPException(400, "Only FunASR models are supported for delete")

    entry = _get_registry_entry(engine, model)
    if entry and os.path.exists(entry.get("path", "")):
        shutil.rmtree(entry["path"], ignore_errors=True)
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
        model_path = str(WHISPER_CPP_MODEL_DIR / f"ggml-{model}.bin")
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
                result["text"] = refiner.refine(result["text"], hotwords_list)
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
    """实时流式转录（用于长时间录音）"""
    await websocket.accept()
    
    if MOCK_MODE:
        # Mock 模式：简单回显
        try:
            while True:
                data = await websocket.receive_bytes()
                await websocket.send_json({
                    "type": "partial",
                    "text": "[Mock] 正在录音...",
                    "segments": []
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
    model = "base"  # 流式用小模型，速度优先
    
    # 确保引擎已加载
    if engine_name not in engines:
        eng = WhisperEngine()
        eng.load(model)
        engines[engine_name] = {"engine": eng, "model": model}
    
    eng = engines[engine_name]["engine"]
    
    buffer = b""
    chunk_duration = 30  # 每 30 秒处理一次
    sample_rate = 16000
    chunk_size = chunk_duration * sample_rate * 2  # 16-bit audio
    
    try:
        while True:
            data = await websocket.receive_bytes()
            buffer += data
            
            if len(buffer) >= chunk_size:
                # 处理当前块
                chunk = buffer[:chunk_size]
                buffer = buffer[chunk_size:]
                
                # 保存临时文件
                with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
                    tmp.write(chunk)
                    tmp_path = tmp.name
                
                try:
                    result = eng.transcribe(tmp_path, language="zh")
                    await websocket.send_json({
                        "type": "partial",
                        "text": result["text"],
                        "segments": result.get("segments", [])
                    })
                finally:
                    os.unlink(tmp_path)
    
    except Exception as e:
        await websocket.send_json({"type": "error", "message": str(e)})
    finally:
        await websocket.close()


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
        print("   Install whisper-cpp via: brew install whisper-cpp")
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
