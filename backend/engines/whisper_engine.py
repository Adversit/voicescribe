"""
Whisper ASR Engine
Supports faster-whisper with automatic fallback to openai-whisper.
"""

import os
from typing import Dict, Any


class WhisperEngine:
    """Whisper ASR engine wrapper."""

    MODELS = ["tiny", "base", "small", "medium", "large-v2", "large-v3"]

    def __init__(self, use_faster: bool = True):
        self.use_faster = use_faster
        self.model = None
        self.model_name = None

    def load(self, model_name: str = "large-v3"):
        """Load a Whisper model."""
        if model_name not in self.MODELS:
            raise ValueError(f"Unknown model: {model_name}. Available: {self.MODELS}")

        if self.use_faster:
            try:
                from faster_whisper import WhisperModel

                self.model = WhisperModel(
                    model_name,
                    device=os.environ.get("VOICESCRIBE_WHISPER_DEVICE", "cpu"),
                    compute_type=os.environ.get("VOICESCRIBE_WHISPER_COMPUTE_TYPE", "int8"),
                )
            except Exception as faster_err:
                print(f"[Whisper] faster-whisper unavailable, fallback to openai-whisper: {faster_err}")
                try:
                    import whisper

                    self.model = whisper.load_model(model_name)
                    self.use_faster = False
                except Exception as whisper_err:
                    raise RuntimeError(
                        f"Failed to load whisper model '{model_name}'. "
                        f"faster-whisper error: {faster_err}; openai-whisper error: {whisper_err}"
                    ) from whisper_err
        else:
            import whisper

            self.model = whisper.load_model(model_name)

        self.model_name = model_name
        backend_name = "faster-whisper" if self.use_faster else "openai-whisper"
        print(f"[Whisper] Loaded model: {model_name} via {backend_name}")

    def transcribe(
        self,
        audio_path: str,
        language: str = "zh",
        **kwargs,
    ) -> Dict[str, Any]:
        """Transcribe audio file."""
        if self.model is None:
            raise RuntimeError("Model not loaded. Call load() first.")

        if self.use_faster:
            segments, info = self.model.transcribe(
                audio_path,
                language=language,
                beam_size=5,
                vad_filter=True,
                vad_parameters=dict(min_silence_duration_ms=500),
            )

            result_segments = []
            full_text = []
            for seg in segments:
                text = seg.text.strip()
                result_segments.append({
                    "start": seg.start,
                    "end": seg.end,
                    "text": text,
                })
                if text:
                    full_text.append(text)

            return {
                "text": " ".join(full_text),
                "segments": result_segments,
                "duration": getattr(info, "duration", 0),
                "language": getattr(info, "language", language),
            }

        result = self.model.transcribe(
            audio_path,
            language=language,
            **kwargs,
        )

        segments = [
            {
                "start": seg["start"],
                "end": seg["end"],
                "text": seg["text"].strip(),
            }
            for seg in result.get("segments", [])
        ]

        return {
            "text": result.get("text", "").strip(),
            "segments": segments,
            "duration": segments[-1]["end"] if segments else 0,
            "language": result.get("language", language),
        }

    def unload(self):
        """Release model memory."""
        self.model = None
        self.model_name = None

        import gc

        gc.collect()
        try:
            import torch

            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass
