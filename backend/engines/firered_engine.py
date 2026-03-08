"""FireRedASR-AED engine adapter.

FireRedASR-AED (1.1B params) achieves CER 3.18% on Chinese benchmarks,
significantly better than Whisper (9.86%) and Paraformer (~4.5%).

Requires: pip install git+https://github.com/FireRedTeam/FireRedASR.git
Audio must be 16kHz 16-bit PCM WAV format.
"""

import logging
import os
import time
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)


class FireRedEngine:
    MODELS = {
        "firered-aed-l": "FireRedTeam/FireRedASR-AED-L",
    }

    def __init__(self):
        self.model = None
        self.loaded_model: Optional[str] = None
        self.device = "cuda" if self._cuda_available() else "cpu"

    @staticmethod
    def _cuda_available() -> bool:
        try:
            import torch
            return torch.cuda.is_available()
        except Exception:
            return False

    def load(self, model_name: str = "firered-aed-l", **kwargs) -> None:
        """Load a FireRedASR model."""
        if model_name not in self.MODELS:
            raise ValueError(
                f"Unknown model: {model_name}. "
                f"Available: {list(self.MODELS.keys())}"
            )

        model_id = self.MODELS[model_name]
        logger.info(f"[FireRedASR] Loading {model_name} ({model_id})...")

        try:
            from fireredasr.models.fireredasr import FireRedAsr
        except ImportError:
            raise RuntimeError(
                "FireRedASR not installed. "
                "Run: pip install git+https://github.com/FireRedTeam/FireRedASR.git"
            )

        # Check for local model path first
        local_path = kwargs.get("local_model_path")
        if local_path and os.path.isdir(local_path):
            logger.info(f"[FireRedASR] Using local model: {local_path}")
            self.model = FireRedAsr.from_pretrained(
                model_type="aed", model_dir=local_path
            )
        else:
            # Download from HuggingFace
            from huggingface_hub import snapshot_download
            model_dir = snapshot_download(repo_id=model_id)
            self.model = FireRedAsr.from_pretrained(
                model_type="aed", model_dir=model_dir
            )

        self.loaded_model = model_name
        logger.info(f"[FireRedASR] Model {model_name} loaded on {self.device}")

    def transcribe(
        self,
        audio_path: str,
        language: str = "zh",
        **kwargs
    ) -> dict:
        """Transcribe an audio file.

        Args:
            audio_path: Path to 16kHz 16-bit PCM WAV file.
            language: Language hint (not used by FireRedASR, kept for interface).

        Returns:
            dict with keys: text, segments, duration, language, engine
        """
        if self.model is None:
            raise RuntimeError("FireRedASR model not loaded. Call load() first.")

        start = time.time()

        results = self.model.transcribe(
            [audio_path],
            {
                "use_gpu": self.device == "cuda",
                "beam_size": 5,
            }
        )

        elapsed = time.time() - start
        text = results[0]["text"] if results else ""

        return {
            "text": text,
            "segments": [{"text": text, "start": 0, "end": elapsed}],
            "duration": elapsed,
            "language": language,
            "engine": "firered",
            "model": self.loaded_model,
        }

    def transcribe_array(
        self,
        audio: np.ndarray,
        sample_rate: int = 16000,
        **kwargs
    ) -> dict:
        """Transcribe from numpy array by writing temp file.

        Args:
            audio: Float32 numpy array of audio samples.
            sample_rate: Sample rate (must be 16000).

        Returns:
            Same as transcribe().
        """
        import tempfile
        import soundfile as sf

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            tmp_path = f.name
            sf.write(tmp_path, audio, sample_rate, subtype="PCM_16")

        try:
            return self.transcribe(tmp_path, **kwargs)
        finally:
            os.unlink(tmp_path)

    def unload(self):
        """Unload the model to free memory."""
        self.model = None
        self.loaded_model = None
        logger.info("[FireRedASR] Model unloaded")
