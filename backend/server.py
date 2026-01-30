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

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

# 尝试导入 ASR 引擎
WHISPER_AVAILABLE = False
WHISPERCPP_AVAILABLE = False
FUNASR_AVAILABLE = False
PARAKEET_AVAILABLE = False

try:
    from engines.whisper_engine import WhisperEngine
    WHISPER_AVAILABLE = True
except ImportError as e:
    print(f"[Warning] Whisper engine not available: {e}")

try:
    from engines.whispercpp_engine import WhisperCppEngine
    WHISPERCPP_AVAILABLE = True
except Exception as e:
    print(f"[Warning] Whisper.cpp engine not available: {e}")

try:
    from engines.funasr_engine import FunASREngine
    FUNASR_AVAILABLE = True
except ImportError as e:
    print(f"[Warning] FunASR engine not available: {e}")

try:
    from engines.parakeet_engine import ParakeetEngine
    PARAKEET_AVAILABLE = True
except ImportError as e:
    print(f"[Warning] Parakeet engine not available: {e}")

# Speaker diarization 是可选的
DIARIZATION_AVAILABLE = False
try:
    from diarization.speaker import SpeakerDiarizer
    DIARIZATION_AVAILABLE = True
except ImportError as e:
    print(f"[Warning] Speaker diarization not available: {e}")


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
            available=WHISPER_AVAILABLE or MOCK_MODE,
        ),
        EngineInfo(
            name="whispercpp",
            models=["tiny", "base", "small", "medium", "large"],
            loaded_model=engines.get("whispercpp", {}).get("model"),
            available=WHISPERCPP_AVAILABLE or MOCK_MODE,
        ),
        EngineInfo(
            name="funasr",
            models=["paraformer-zh", "paraformer-zh-streaming", "sensevoice-small"],
            loaded_model=engines.get("funasr", {}).get("model"),
            available=FUNASR_AVAILABLE or MOCK_MODE,
        ),
        EngineInfo(
            name="parakeet",
            models=["parakeet-ctc-1.1b", "parakeet-tdt-1.1b"],
            loaded_model=engines.get("parakeet", {}).get("model"),
            available=PARAKEET_AVAILABLE or MOCK_MODE,
        ),
    ]
    return available


@app.post("/load")
async def load_engine(engine: str, model: str):
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
        model_path = os.path.expanduser(f"~/.whisper-models/ggml-{model}.bin")
        eng = WhisperCppEngine(model_path=model_path)
        engines["whispercpp"] = {"engine": eng, "model": model}
    elif engine == "funasr":
        if not FUNASR_AVAILABLE:
            raise HTTPException(400, "FunASR engine not available. Install funasr.")
        eng = FunASREngine()
        eng.load(model)
        engines["funasr"] = {"engine": eng, "model": model}
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
    
    # 模拟处理时间
    time.sleep(0.5)
    
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
            await load_engine(engine, model)
        
        eng = engines[engine]["engine"]

        # Transcribe (pass hotwords for FunASR)
        if engine == "funasr" and hotwords:
            result = eng.transcribe(tmp_path, language=language, hotwords=hotwords)
        else:
            result = eng.transcribe(tmp_path, language=language)
        
        # Speaker diarization if enabled
        if enable_diarization and DIARIZATION_AVAILABLE:
            if diarizer is None:
                diarizer = SpeakerDiarizer()
                diarizer.load()
            
            speakers = diarizer.diarize(tmp_path)
            result = diarizer.assign_speakers(result, speakers, audio_path=tmp_path)
        
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
        print("=" * 50)
    
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
