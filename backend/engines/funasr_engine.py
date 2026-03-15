"""FunASR engine with local-cache-first model resolution."""

from __future__ import annotations

from typing import Any, Dict

from diarization.speaker_models import (
    resolve_local_model_path,
    resolve_speaker_model_for_load,
)


class FunASREngine:
    """FunASR speech recognition engine."""

    MODELS = {
        "paraformer-zh": "iic/speech_paraformer-large-vad-punc_asr_nat-zh-cn-16k-common-vocab8404-pytorch",
        "paraformer-zh-streaming": "iic/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-online",
        "seaco-paraformer": "iic/speech_seaco_paraformer_large_asr_nat-zh-cn-16k-common-vocab8404-pytorch",
        "sensevoice-small": "iic/SenseVoiceSmall",
    }

    RESOURCE_ALIASES = {
        "fsmn-vad": "iic/speech_fsmn_vad_zh-cn-16k-common-pytorch",
        "ct-punc": "iic/punc_ct-transformer_cn-en-common-vocab471067-large",
    }

    def __init__(self):
        self.model = None
        self.model_name = None
        self.enable_diarization = False

    def _resolve_resource(self, resource: str) -> str:
        """Resolve a FunASR resource ID to a local cache path when available."""
        model_id = self.RESOURCE_ALIASES.get(resource, resource)
        return resolve_local_model_path(model_id)

    def load(self, model_name: str = "paraformer-zh", enable_diarization: bool = False):
        """Load the selected FunASR model."""
        if model_name not in self.MODELS:
            raise ValueError(
                f"Unknown model: {model_name}. Available: {list(self.MODELS.keys())}"
            )

        from funasr import AutoModel

        model_target = self._resolve_resource(self.MODELS[model_name])
        device = self._get_device()
        print(f"[FunASR] Using device: {device}")
        print(f"[FunASR] Loading model from: {model_target}")

        self.enable_diarization = enable_diarization

        diarization_kwargs: dict[str, object] = {}
        if enable_diarization:
            _, spk_model_target = resolve_speaker_model_for_load("cam++")
            diarization_kwargs = {
                "spk_model": spk_model_target,
                "spk_mode": "punc_segment",
            }

        common_kwargs = {
            "model": model_target,
            "device": device,
            "disable_update": True,
            **diarization_kwargs,
        }

        if model_name == "sensevoice-small":
            self.model = AutoModel(
                vad_model=self._resolve_resource("fsmn-vad"),
                vad_kwargs={"max_single_segment_time": 30000},
                **common_kwargs,
            )
        elif model_name == "seaco-paraformer":
            self.model = AutoModel(
                model_revision="v2.0.4",
                vad_model=self._resolve_resource("fsmn-vad"),
                punc_model=self._resolve_resource("ct-punc"),
                **common_kwargs,
            )
        else:
            self.model = AutoModel(
                model_revision="v2.0.4",
                vad_model=self._resolve_resource("fsmn-vad"),
                punc_model=self._resolve_resource("ct-punc"),
                **common_kwargs,
            )

        self.model_name = model_name
        if enable_diarization:
            print(f"[FunASR] Loaded model with diarization: {model_name}")
        else:
            print(f"[FunASR] Loaded model: {model_name}")

    def _get_device(self) -> str:
        """Prefer CUDA, then MPS, then CPU."""
        try:
            import torch

            if torch.cuda.is_available():
                return "cuda:0"
            if torch.backends.mps.is_available():
                return "mps"
            return "cpu"
        except Exception:
            return "cpu"

    def _clean_chinese_text(self, text: str) -> str:
        """Remove unwanted spaces inside Chinese text."""
        import re

        text = re.sub(r"([\u4e00-\u9fff])\s+([\u4e00-\u9fff])", r"\1\2", text)
        text = re.sub(r"([\u4e00-\u9fff])\s+([\u4e00-\u9fff])", r"\1\2", text)
        text = re.sub(
            r"([\u4e00-\u9fff])\s+([，。！？、；：“”‘’（）])",
            r"\1\2",
            text,
        )
        text = re.sub(
            r"([，。！？、；：“”‘’（）])\s+([\u4e00-\u9fff])",
            r"\1\2",
            text,
        )
        return text.strip()

    def transcribe(
        self,
        audio_path: str,
        language: str = "zh",
        hotwords: str = "",
        **kwargs,
    ) -> Dict[str, Any]:
        """Transcribe an audio file."""
        if self.model is None:
            raise RuntimeError("Model not loaded. Call load() first.")

        hotword_str = ""
        if hotwords:
            parts = [part.strip() for part in hotwords.split(",") if part.strip()]
            hotword_str = " ".join(parts)
            print(f"[FunASR] Hotwords: {hotword_str}")

        result = self.model.generate(
            input=audio_path,
            batch_size_s=300,
            hotword=hotword_str,
        )

        if not result:
            return {"text": "", "segments": [], "duration": 0}

        output = result[0] if isinstance(result, list) else result
        text = self._clean_chinese_text(output.get("text", ""))

        segments = []
        sentences = output.get("sentence_info", [])
        if sentences:
            for sent in sentences:
                speaker = None
                if "spk" in sent:
                    try:
                        speaker = f"SPEAKER_{int(sent.get('spk', 0)):02d}"
                    except Exception:
                        speaker = None

                segment = {
                    "start": sent.get("start", 0) / 1000,
                    "end": sent.get("end", 0) / 1000,
                    "text": sent.get("text", ""),
                }
                if speaker:
                    segment["speaker"] = speaker
                segments.append(segment)

        duration = segments[-1]["end"] if segments else 0
        return {
            "text": text,
            "segments": segments,
            "duration": duration,
            "language": language,
        }

    def transcribe_array(
        self,
        audio: "np.ndarray",
        sample_rate: int = 16000,
        **kwargs,
    ) -> Dict[str, Any]:
        """Transcribe from a numpy array via a temporary WAV file."""
        import os
        import tempfile

        import soundfile as sf

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as handle:
            tmp_path = handle.name
            sf.write(tmp_path, audio, sample_rate, subtype="PCM_16")

        try:
            return self.transcribe(tmp_path, **kwargs)
        finally:
            os.unlink(tmp_path)

    def unload(self):
        """Release the loaded model and GPU memory."""
        self.model = None
        self.model_name = None

        import gc

        import torch

        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
