"""
Whisper ASR Engine
支持 OpenAI Whisper 和 faster-whisper
"""

import os
from pathlib import Path
from typing import Any, Dict

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

from config import MODEL_CACHE_DIR


class WhisperEngine:
    """Whisper 语音识别引擎"""

    MODELS = ["tiny", "base", "small", "medium", "large-v2", "large-v3"]

    def __init__(self, use_faster: bool = True):
        """
        Args:
            use_faster: 使用 faster-whisper（更快，推荐）
        """
        self.use_faster = use_faster and not self._should_force_openai_whisper()
        self.model = None
        self.model_name = None
        self.backend_name = "faster-whisper" if self.use_faster else "openai-whisper"
        self.supports_external_speaker_chain = True

    def capabilities(self) -> Dict[str, Any]:
        return {
            "supports_builtin_diarization": False,
            "supports_external_speaker_chain": True,
            "speaker_text_alignment_limited": False,
        }

    @staticmethod
    def _should_force_openai_whisper() -> bool:
        """Windows 默认回退到 openai-whisper，避免 ctranslate2 进程级崩溃。"""
        if os.name != "nt":
            return False
        return os.environ.get("VOICESCRIBE_FORCE_FASTER_WHISPER", "0") != "1"

    @staticmethod
    def _load_audio_array(audio_path: str) -> np.ndarray:
        """读取音频并标准化为 16kHz / mono / float32，供 openai-whisper 直接使用。"""
        audio, sample_rate = sf.read(audio_path, always_2d=False)

        if getattr(audio, "ndim", 1) > 1:
            audio = np.mean(audio, axis=1)

        if sample_rate != 16000:
            audio = resample_poly(audio, 16000, sample_rate)

        audio = np.asarray(audio, dtype=np.float32)
        max_abs = float(np.max(np.abs(audio))) if audio.size else 0.0
        if max_abs > 1.0:
            audio = audio / max_abs

        return audio

    def load(self, model_name: str = "large-v3"):
        """加载模型"""
        model_source = Path(model_name).expanduser()
        is_local_path = model_source.exists()

        if not is_local_path and model_name not in self.MODELS:
            raise ValueError(f"Unknown model: {model_name}. Available: {self.MODELS}")

        load_target = str(model_source.resolve()) if is_local_path else model_name

        if self.use_faster:
            from faster_whisper import WhisperModel

            self.model = WhisperModel(
                load_target,
                device="auto",
                compute_type="int8",
                download_root=str((MODEL_CACHE_DIR / "whisper").resolve()),
            )
        else:
            import whisper

            self.model = whisper.load_model(
                load_target,
                download_root=str((MODEL_CACHE_DIR / "whisper").resolve()),
            )

        self.model_name = model_name
        print(f"[Whisper] Loaded model: {model_name} via {self.backend_name}")

    def transcribe(
        self,
        audio_path: str,
        language: str = "zh",
        **kwargs,
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
                vad_filter=True,
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

        audio_array = self._load_audio_array(audio_path)
        result = self.model.transcribe(
            audio_array,
            language=language,
            **kwargs,
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
