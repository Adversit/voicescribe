"""
Whisper ASR Engine
支持 OpenAI Whisper 和 faster-whisper
"""

import os
from typing import Optional, Dict, Any
from pathlib import Path


class WhisperEngine:
    """Whisper 语音识别引擎"""
    
    MODELS = ["tiny", "base", "small", "medium", "large-v2", "large-v3"]
    
    def __init__(self, use_faster: bool = True):
        """
        Args:
            use_faster: 使用 faster-whisper（更快，推荐）
        """
        self.use_faster = use_faster
        self.model = None
        self.model_name = None
    
    def load(self, model_name: str = "large-v3"):
        """加载模型"""
        if model_name not in self.MODELS:
            raise ValueError(f"Unknown model: {model_name}. Available: {self.MODELS}")
        
        if self.use_faster:
            from faster_whisper import WhisperModel
            
            # 使用 int8 量化，平衡速度和精度
            self.model = WhisperModel(
                model_name,
                device="auto",  # 自动选择 CPU/GPU
                compute_type="int8",
            )
        else:
            import whisper
            self.model = whisper.load_model(model_name)
        
        self.model_name = model_name
        print(f"[Whisper] Loaded model: {model_name}")
    
    def transcribe(
        self,
        audio_path: str,
        language: str = "zh",
        **kwargs
    ) -> Dict[str, Any]:
        """
        转录音频文件
        
        Args:
            audio_path: 音频文件路径
            language: 语言代码（zh, en, ja 等）
            
        Returns:
            {
                "text": "完整文本",
                "segments": [{"start": 0.0, "end": 2.5, "text": "..."}],
                "duration": 总时长
            }
        """
        if self.model is None:
            raise RuntimeError("Model not loaded. Call load() first.")
        
        if self.use_faster:
            segments, info = self.model.transcribe(
                audio_path,
                language=language,
                beam_size=5,
                vad_filter=True,  # 过滤静音
                vad_parameters=dict(
                    min_silence_duration_ms=500,
                ),
            )
            
            result_segments = []
            full_text = []
            
            for seg in segments:
                result_segments.append({
                    "start": seg.start,
                    "end": seg.end,
                    "text": seg.text.strip(),
                })
                full_text.append(seg.text.strip())
            
            return {
                "text": " ".join(full_text),
                "segments": result_segments,
                "duration": info.duration,
                "language": info.language,
            }
        
        else:
            # Original whisper
            result = self.model.transcribe(
                audio_path,
                language=language,
                **kwargs
            )
            
            return {
                "text": result["text"].strip(),
                "segments": [
                    {
                        "start": seg["start"],
                        "end": seg["end"],
                        "text": seg["text"].strip(),
                    }
                    for seg in result["segments"]
                ],
                "duration": result["segments"][-1]["end"] if result["segments"] else 0,
                "language": result.get("language", language),
            }
    
    def unload(self):
        """卸载模型释放内存"""
        self.model = None
        self.model_name = None
        
        import gc
        import torch
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
