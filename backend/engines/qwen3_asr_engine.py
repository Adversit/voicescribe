"""
Qwen3-ASR Engine
Vendor-supported Qwen3-ASR wrapper via qwen-asr.
"""

from pathlib import Path
from typing import Any, Dict

import soundfile as sf

from config import HF_HOME_DIR


class Qwen3ASREngine:
    """Qwen3-ASR speech recognition engine."""

    MODELS = {
        "qwen3-asr-1.7b": "Qwen/Qwen3-ASR-1.7B",
    }

    LANGUAGE_MAP = {
        "zh": "Chinese",
        "zh-cn": "Chinese",
        "zh-tw": "Chinese",
        "yue": "Cantonese",
        "en": "English",
        "ja": "Japanese",
        "ko": "Korean",
        "fr": "French",
        "de": "German",
        "es": "Spanish",
        "ru": "Russian",
    }

    def __init__(self):
        self.pipeline = None
        self.model_name = None

    def _normalize_language(self, language: str | None) -> str | None:
        if not language:
            return None
        lowered = language.strip().lower()
        if not lowered:
            return None
        if lowered in self.LANGUAGE_MAP:
            return self.LANGUAGE_MAP[lowered]
        return lowered[:1].upper() + lowered[1:]

    def load(self, model_name: str = "qwen3-asr-1.7b"):
        model_source = Path(model_name).expanduser()
        is_local_path = model_source.exists()

        if not is_local_path and model_name not in self.MODELS:
            raise ValueError(f"Unknown model: {model_name}. Available: {list(self.MODELS.keys())}")

        try:
            from qwen_asr import Qwen3ASRModel
        except ImportError as err:
            raise ImportError(
                "Qwen3-ASR requires qwen-asr. Install with: pip install -U qwen-asr"
            ) from err

        model_id = str(model_source.resolve()) if is_local_path else self.MODELS[model_name]
        self.pipeline = Qwen3ASRModel.from_pretrained(
            model_id,
            trust_remote_code=True,
            cache_dir=str(HF_HOME_DIR),
            device_map="auto",
        )
        self.model_name = model_name
        print(f"[Qwen3-ASR] Loaded model: {model_name}")

    def transcribe(self, audio_path: str, language: str = "zh", **kwargs) -> Dict[str, Any]:
        if self.pipeline is None:
            raise RuntimeError("Model not loaded. Call load() first.")

        normalized_language = self._normalize_language(language)
        results = self.pipeline.transcribe(audio_path, language=normalized_language)
        result = results[0] if results else None
        text = (getattr(result, "text", "") or "").strip() if result is not None else ""

        try:
            audio_info = sf.info(audio_path)
            duration = float(audio_info.duration or 0.0)
        except Exception:
            duration = 0.0

        segments = []
        if text:
            segments.append(
                {
                    "start": 0.0,
                    "end": duration,
                    "text": text,
                }
            )

        return {
            "text": text,
            "segments": segments,
            "duration": duration,
            "language": normalized_language or language,
        }

    def unload(self):
        self.pipeline = None
        self.model_name = None
