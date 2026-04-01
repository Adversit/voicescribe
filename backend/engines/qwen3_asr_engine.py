"""
Qwen3-ASR Engine
独立的 Qwen3-ASR 转录引擎封装
"""

from pathlib import Path
from typing import Any, Dict

from config import HF_HOME_DIR


class Qwen3ASREngine:
    """Qwen3-ASR 语音识别引擎。"""

    MODELS = {
        "qwen3-asr-1.7b": "Qwen/Qwen3-ASR-1.7B",
    }

    def __init__(self):
        self.pipeline = None
        self.model_name = None

    def load(self, model_name: str = "qwen3-asr-1.7b"):
        model_source = Path(model_name).expanduser()
        is_local_path = model_source.exists()

        if not is_local_path and model_name not in self.MODELS:
            raise ValueError(f"Unknown model: {model_name}. Available: {list(self.MODELS.keys())}")

        try:
            from transformers import pipeline
        except ImportError as err:
            raise ImportError(
                "Qwen3-ASR requires transformers. Install with: pip install transformers"
            ) from err

        model_id = str(model_source.resolve()) if is_local_path else self.MODELS[model_name]
        self.pipeline = pipeline(
            task="automatic-speech-recognition",
            model=model_id,
            trust_remote_code=True,
            model_kwargs={
                "cache_dir": str(HF_HOME_DIR),
            },
        )
        self.model_name = model_name
        print(f"[Qwen3-ASR] Loaded model: {model_name}")

    def transcribe(self, audio_path: str, language: str = "zh", **kwargs) -> Dict[str, Any]:
        if self.pipeline is None:
            raise RuntimeError("Model not loaded. Call load() first.")

        result = self.pipeline(
            audio_path,
            return_timestamps=True,
            generate_kwargs={"language": language},
        )

        chunks = result.get("chunks") or []
        segments = []
        for chunk in chunks:
            timestamp = chunk.get("timestamp") or (None, None)
            start, end = timestamp if isinstance(timestamp, (list, tuple)) and len(timestamp) == 2 else (None, None)
            if start is None or end is None:
                continue
            segments.append(
                {
                    "start": float(start),
                    "end": float(end),
                    "text": (chunk.get("text") or "").strip(),
                }
            )

        duration = segments[-1]["end"] if segments else 0.0
        return {
            "text": (result.get("text") or "").strip(),
            "segments": segments,
            "duration": duration,
            "language": language,
        }

    def unload(self):
        self.pipeline = None
        self.model_name = None
