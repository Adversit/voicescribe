"""FireRedASR-AED engine adapter.

FireRedASR-AED (1.1B params) achieves CER 3.18% on Chinese benchmarks,
significantly better than Whisper (9.86%) and Paraformer (~4.5%).

Requires: pip install fireredasr
Audio must be 16kHz 16-bit PCM WAV format.
"""

import logging
import os
import tempfile
import time
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)


def _find_hf_snapshot(base_dir: str) -> Optional[str]:
    """Find the latest snapshot inside a HuggingFace cache directory."""
    snapshots_dir = os.path.join(base_dir, "snapshots")
    if os.path.isdir(snapshots_dir):
        entries = [
            os.path.join(snapshots_dir, d)
            for d in os.listdir(snapshots_dir)
            if os.path.isdir(os.path.join(snapshots_dir, d))
        ]
        if entries:
            return max(entries, key=os.path.getmtime)
    return None


def _resolve_model_dir(path: str) -> str:
    """Resolve model dir: if it's a HF cache root, find the snapshot."""
    model_pth = os.path.join(path, "model.pth.tar")
    if os.path.isfile(model_pth):
        return path
    snapshot = _find_hf_snapshot(path)
    if snapshot:
        return snapshot
    return path


class FireRedEngine:
    MODELS = {
        "firered-aed-l": "FireRedTeam/FireRedASR-AED-L",
    }
    MIN_AUDIO_SECONDS = 0.5

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
        """Load a FireRedASR model from local path or HuggingFace."""
        if model_name not in self.MODELS:
            raise ValueError(
                f"Unknown model: {model_name}. "
                f"Available: {list(self.MODELS.keys())}"
            )

        try:
            from fireredasr.models.fireredasr import (
                FireRedAsr,
                ASRFeatExtractor,
                load_fireredasr_aed_model,
                ChineseCharEnglishSpmTokenizer,
            )
        except ImportError:
            raise RuntimeError(
                "FireRedASR not installed. Run: pip install fireredasr"
            )

        # Resolve local model directory
        local_path = kwargs.get("local_model_path")
        if local_path and os.path.isdir(local_path):
            model_dir = _resolve_model_dir(local_path)
            logger.info(f"[FireRedASR] Using local model: {model_dir}")
        else:
            # Download from HuggingFace
            from huggingface_hub import snapshot_download
            repo_id = self.MODELS[model_name]
            logger.info(f"[FireRedASR] Downloading {repo_id} from HuggingFace...")
            model_dir = snapshot_download(repo_id=repo_id)

        # Build model from files
        cmvn_path = os.path.join(model_dir, "cmvn.ark")
        model_path = os.path.join(model_dir, "model.pth.tar")
        dict_path = os.path.join(model_dir, "dict.txt")
        spm_model = os.path.join(model_dir, "train_bpe1000.model")

        logger.info(f"[FireRedASR] Loading model from {model_dir}...")
        # PyTorch 2.6+ defaults weights_only=True; FireRedASR checkpoint
        # contains argparse.Namespace which needs to be allowlisted.
        import argparse
        import torch
        torch.serialization.add_safe_globals([argparse.Namespace])

        feat_extractor = ASRFeatExtractor(cmvn_path)
        aed_model = load_fireredasr_aed_model(model_path)
        tokenizer = ChineseCharEnglishSpmTokenizer(dict_path, spm_model)
        aed_model.eval()

        self.model = FireRedAsr("aed", feat_extractor, aed_model, tokenizer)
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
            language: Language hint (not used by FireRedASR).

        Returns:
            dict with keys: text, segments, duration, language, engine
        """
        if self.model is None:
            raise RuntimeError("FireRedASR model not loaded. Call load() first.")

        start = time.time()
        prepared_path = audio_path
        temp_path = None
        duration = 0.0

        try:
            prepared_path, duration, temp_path = self._prepare_audio_path(audio_path)
            results = self.model.transcribe(
                ["utt1"],
                [prepared_path],
                {
                    "use_gpu": self.device == "cuda",
                    "beam_size": 5,
                }
            )
        except RuntimeError as exc:
            if "Kernel size can't be greater than actual input size" in str(exc):
                logger.warning("[FireRedASR] Audio too short for encoder, returning empty text")
                return self._empty_result(duration=duration, language=language)
            raise
        finally:
            if temp_path:
                try:
                    os.unlink(temp_path)
                except OSError:
                    pass

        elapsed = time.time() - start
        text = results[0]["text"] if results else ""

        return {
            "text": text,
            "segments": [{"text": text, "start": 0, "end": duration or elapsed}],
            "duration": duration or elapsed,
            "language": language,
            "engine": "firered",
            "model": self.loaded_model,
        }

    def _prepare_audio_path(self, audio_path: str) -> tuple[str, float, Optional[str]]:
        import soundfile as sf

        audio, sample_rate = sf.read(audio_path)
        if audio.ndim > 1:
            audio = audio.mean(axis=1)
        audio = audio.astype(np.float32, copy=False)
        duration = len(audio) / sample_rate if sample_rate else 0.0

        if duration >= self.MIN_AUDIO_SECONDS:
            return audio_path, duration, None

        target_samples = int(self.MIN_AUDIO_SECONDS * sample_rate)
        padded = np.pad(audio, (0, max(0, target_samples - len(audio))))

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            temp_path = f.name
            sf.write(temp_path, padded, sample_rate, subtype="PCM_16")

        return temp_path, duration, temp_path

    def _empty_result(self, duration: float, language: str) -> dict:
        return {
            "text": "",
            "segments": [],
            "duration": duration,
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
        """Transcribe from numpy array by writing temp file."""
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
