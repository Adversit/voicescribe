"""Real-time speaker tracking for streaming transcription."""

import logging
import os
import tempfile
import wave
from dataclasses import dataclass
from typing import Optional

import numpy as np

from diarization.speaker_models import (
    normalize_speaker_model_name,
    resolve_hf_repo_for_load,
    resolve_speaker_model_for_load,
)

logger = logging.getLogger(__name__)

PYANNOTE_CLUSTER_REPO_ID = "pyannote/embedding"


def build_speaker_backend_plan(
    enable_streaming: bool,
    enable_diarization: bool,
    sv_model_name: Optional[str] = None,
) -> dict:
    """Build a backend preload plan from feature flags."""
    return {
        "preload_cluster": bool(enable_streaming),
        "preload_mapping": bool(enable_diarization),
        "speaker_model": normalize_speaker_model_name(sv_model_name),
    }


@dataclass
class SpeakerInfo:
    cluster_id: int
    label: str
    registered_name: Optional[str] = None
    registered_id: Optional[str] = None
    confidence: float = 0.0
    embedding: Optional[np.ndarray] = None

    @property
    def display_name(self) -> str:
        if self.registered_name:
            return self.registered_name
        return f"Speaker {self.cluster_id + 1}"


class DiartSpeakerTracker:
    """Speaker tracking with diarization-first clustering and voiceprint mapping."""

    def __init__(
        self,
        max_speakers: int = 8,
        match_threshold: float = 0.6,
        sv_model_name: Optional[str] = None,
    ):
        self.max_speakers = max_speakers
        self.match_threshold = match_threshold
        self.sv_model_name = normalize_speaker_model_name(
            sv_model_name or os.environ.get("VOICESCRIBE_SPK_MODEL")
        )
        self.active_speaker: Optional[SpeakerInfo] = None
        self.speakers: dict[int, SpeakerInfo] = {}
        self.known_speakers: dict[str, dict] = {}

        self._cluster_backend: Optional[str] = None
        self._cluster_inference = None
        self._cluster_init_attempted = False
        self._mapping_backend: Optional[str] = None
        self._mapping_model = None
        self._mapping_inference = None
        self._mapping_init_attempted = False

    def preload(
        self,
        preload_cluster: bool = True,
        preload_mapping: bool = True,
    ) -> dict:
        """Eagerly load requested backends and return status info."""
        if preload_cluster:
            self._ensure_cluster_backend()
        if preload_mapping:
            self._ensure_mapping_backend()
        return {
            "backend": self._compose_backend_name(
                requested_cluster=preload_cluster,
                requested_mapping=preload_mapping,
            ),
            "cluster_backend": self._cluster_backend,
            "mapping_backend": self._mapping_backend,
            "requested_cluster": preload_cluster,
            "requested_mapping": preload_mapping,
            "available": (self._cluster_backend is not None)
            or (self._mapping_backend is not None),
        }

    def _compose_backend_name(
        self,
        requested_cluster: bool = True,
        requested_mapping: bool = True,
    ) -> Optional[str]:
        cluster_backend = self._cluster_backend if requested_cluster else None
        mapping_backend = self._mapping_backend if requested_mapping else None
        if cluster_backend and mapping_backend:
            return f"{cluster_backend}->{mapping_backend}"
        return mapping_backend or cluster_backend

    def _ensure_cluster_backend(self):
        """Prefer pyannote for clustering / anonymous speaker labels."""
        if self._cluster_init_attempted:
            return
        self._cluster_init_attempted = True

        try:
            from pyannote.audio import Inference, Model

            target = resolve_hf_repo_for_load(PYANNOTE_CLUSTER_REPO_ID)
            hf_token = os.environ.get("HF_TOKEN")
            if target == PYANNOTE_CLUSTER_REPO_ID and not hf_token:
                raise RuntimeError("HF_TOKEN required for pyannote clustering")

            logger.info("[SpeakerTracker] Loading pyannote clustering from %s", target)
            model = Model.from_pretrained(target, token=hf_token or None)
            self._cluster_inference = Inference(model, window="whole")
            self._cluster_backend = "pyannote"
            logger.info("[SpeakerTracker] pyannote clustering model loaded")
        except Exception as exc:
            logger.warning("[SpeakerTracker] pyannote clustering unavailable: %s", exc)

    def _ensure_mapping_backend(self):
        """Prefer CAM++ for registered-speaker mapping; fall back if needed."""
        if self._mapping_init_attempted:
            return
        self._mapping_init_attempted = True

        try:
            from funasr import AutoModel

            self.sv_model_name, resolved = resolve_speaker_model_for_load(self.sv_model_name)
            logger.info(
                "[SpeakerTracker] Loading mapping model [%s] from %s",
                self.sv_model_name,
                resolved,
            )
            self._mapping_model = AutoModel(model=resolved, disable_update=True)
            self._mapping_backend = "funasr"
            logger.info("[SpeakerTracker] Mapping model loaded via FunASR")
            return
        except ImportError:
            logger.info(
                "[SpeakerTracker] FunASR not installed, trying pyannote for mapping fallback"
            )
        except Exception as exc:
            logger.warning("[SpeakerTracker] CAM++ mapping load failed: %s", exc)

        try:
            from pyannote.audio import Inference, Model

            target = resolve_hf_repo_for_load(PYANNOTE_CLUSTER_REPO_ID)
            hf_token = os.environ.get("HF_TOKEN")
            if target == PYANNOTE_CLUSTER_REPO_ID and not hf_token:
                raise RuntimeError("HF_TOKEN required for pyannote mapping fallback")

            logger.info("[SpeakerTracker] Loading pyannote mapping fallback from %s", target)
            model = Model.from_pretrained(target, token=hf_token or None)
            self._mapping_inference = Inference(model, window="whole")
            self._mapping_backend = "pyannote"
            logger.info("[SpeakerTracker] pyannote mapping fallback loaded")
        except Exception as exc:
            logger.warning("[SpeakerTracker] pyannote mapping fallback failed: %s", exc)

    def register_known_speaker(
        self,
        name: str,
        speaker_id: str,
        embedding: np.ndarray,
    ):
        """Register a known speaker's voiceprint for mapping."""
        norm = np.linalg.norm(embedding)
        self.known_speakers[speaker_id] = {
            "name": name,
            "embedding": embedding / norm if norm > 0 else embedding,
        }
        logger.info("[SpeakerTracker] Registered known speaker: %s", name)

    def register_from_audio(self, name: str, speaker_id: str, audio_path: str) -> bool:
        """Register a speaker using the mapping backend for consistent matching."""
        self._ensure_mapping_backend()
        if self._mapping_backend is None:
            logger.warning("[SpeakerTracker] No mapping backend, cannot register %s", name)
            return False

        import soundfile as sf

        audio, _ = sf.read(audio_path)
        if audio.ndim > 1:
            audio = audio.mean(axis=1)
        audio = audio.astype(np.float32, copy=False)

        embedding = self._extract_mapping_embedding(audio)
        if embedding is None:
            logger.warning("[SpeakerTracker] Failed to extract embedding for %s", name)
            return False

        self.register_known_speaker(name, speaker_id, embedding)
        logger.info("[SpeakerTracker] Registered %s via %s", name, self._mapping_backend)
        return True

    def identify_speaker(
        self, embedding: np.ndarray
    ) -> tuple[Optional[str], Optional[str], float]:
        """Match an embedding against known speakers."""
        if not self.known_speakers:
            return None, None, 0.0

        norm = np.linalg.norm(embedding)
        embedding_norm = embedding / norm if norm > 0 else embedding
        best_id = None
        best_name = None
        best_score = 0.0

        for speaker_id, info in self.known_speakers.items():
            score = float(np.dot(embedding_norm, info["embedding"]))
            if score > best_score:
                best_score = score
                best_id = speaker_id
                best_name = info["name"]

        if best_score >= self.match_threshold:
            return best_id, best_name, best_score
        return None, None, best_score

    def process_segment(
        self, audio: np.ndarray, start_time: float, end_time: float
    ) -> SpeakerInfo:
        """Cluster the segment first, then map that cluster to a registered speaker."""
        cluster_embedding = self._extract_cluster_embedding(audio)
        mapping_embedding = self._extract_mapping_embedding(audio)
        cluster_source = cluster_embedding if cluster_embedding is not None else mapping_embedding

        if cluster_source is not None:
            cluster_id = self._get_or_create_cluster(cluster_source)
            if mapping_embedding is not None:
                spk_id, spk_name, confidence = self.identify_speaker(mapping_embedding)
            else:
                spk_id, spk_name, confidence = (None, None, 0.0)

            if spk_id is None:
                existing = self.speakers.get(cluster_id)
                if existing and existing.registered_id:
                    spk_id = existing.registered_id
                    spk_name = existing.registered_name
                    confidence = max(confidence, existing.confidence)

            info = SpeakerInfo(
                cluster_id=cluster_id,
                label=f"Speaker_{cluster_id}",
                registered_name=spk_name,
                registered_id=spk_id,
                confidence=confidence,
                embedding=cluster_source,
            )
        else:
            info = SpeakerInfo(cluster_id=0, label="Speaker_0")

        self.speakers[info.cluster_id] = info
        self.active_speaker = info
        return info

    def _extract_cluster_embedding(self, audio: np.ndarray) -> Optional[np.ndarray]:
        """Extract embedding for diarization-style clustering."""
        self._ensure_cluster_backend()
        if self._cluster_backend == "pyannote":
            return self._extract_pyannote(audio, self._cluster_inference)

        self._ensure_mapping_backend()
        if self._mapping_backend == "pyannote":
            return self._extract_pyannote(audio, self._mapping_inference)
        if self._mapping_backend == "funasr":
            return self._extract_funasr(audio, self._mapping_model)
        return None

    def _extract_mapping_embedding(self, audio: np.ndarray) -> Optional[np.ndarray]:
        """Extract embedding for registered-speaker mapping."""
        self._ensure_mapping_backend()

        if self._mapping_backend == "pyannote":
            return self._extract_pyannote(audio, self._mapping_inference)
        if self._mapping_backend == "funasr":
            return self._extract_funasr(audio, self._mapping_model)
        return None

    def _extract_pyannote(self, audio: np.ndarray, inference) -> Optional[np.ndarray]:
        """Extract embedding via pyannote ECAPA-TDNN."""
        if inference is None:
            return None
        try:
            import torch

            waveform = torch.from_numpy(audio).float().unsqueeze(0)
            emb = inference({"waveform": waveform, "sample_rate": 16000})
            return np.array(emb).flatten()
        except Exception as exc:
            logger.warning("[SpeakerTracker] pyannote extraction failed: %s", exc)
            return None

    def _extract_funasr(self, audio: np.ndarray, model) -> Optional[np.ndarray]:
        """Extract embedding via FunASR CAM++ (needs temp WAV file)."""
        if model is None:
            return None

        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
                tmp_path = tmp.name
            with wave.open(tmp_path, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(16000)
                pcm = (audio * 32767).astype(np.int16)
                wf.writeframes(pcm.tobytes())

            result = model.generate(tmp_path)

            if isinstance(result, dict) and "spk_embedding" in result:
                emb = result["spk_embedding"]
            elif isinstance(result, list) and len(result) > 0:
                if isinstance(result[0], dict) and "spk_embedding" in result[0]:
                    emb = result[0]["spk_embedding"]
                else:
                    emb = result[0]
            else:
                emb = result

            if not isinstance(emb, np.ndarray):
                try:
                    import torch

                    if isinstance(emb, torch.Tensor):
                        emb = emb.detach().cpu().numpy()
                    else:
                        emb = np.asarray(emb)
                except Exception:
                    emb = np.asarray(emb)

            return emb.flatten()
        except Exception as exc:
            logger.warning("[SpeakerTracker] FunASR extraction failed: %s", exc)
            return None
        finally:
            if tmp_path:
                try:
                    os.unlink(tmp_path)
                except Exception:
                    pass

    def _get_or_create_cluster(self, embedding: np.ndarray) -> int:
        """Assign embedding to an existing cluster or create a new one."""
        norm = np.linalg.norm(embedding)
        embedding_norm = embedding / norm if norm > 0 else embedding

        best_cluster = -1
        best_score = 0.0

        for cluster_id, info in self.speakers.items():
            if info.embedding is not None:
                ref_norm = np.linalg.norm(info.embedding)
                ref = info.embedding / ref_norm if ref_norm > 0 else info.embedding
                score = float(np.dot(embedding_norm, ref))
                if score > best_score:
                    best_score = score
                    best_cluster = cluster_id

        if best_score >= 0.5 and best_cluster >= 0:
            return best_cluster

        if len(self.speakers) >= self.max_speakers:
            return max(self.speakers.keys(), key=lambda cid: self.speakers[cid].confidence)

        return len(self.speakers)

    def reset(self):
        """Reset tracking state for a new session. Keeps models loaded."""
        self.active_speaker = None
        self.speakers.clear()
        logger.info("[SpeakerTracker] State reset")

    def reload_embedding_backend(
        self,
        preload_cluster: bool = False,
        preload_mapping: bool = False,
        sv_model_name: Optional[str] = None,
    ) -> dict:
        """Force re-init of clustering/mapping backend selection."""
        if sv_model_name is not None:
            self.sv_model_name = normalize_speaker_model_name(sv_model_name)
        self._cluster_backend = None
        self._cluster_inference = None
        self._cluster_init_attempted = False
        self._mapping_backend = None
        self._mapping_model = None
        self._mapping_inference = None
        self._mapping_init_attempted = False
        self.reset()
        return self.preload(
            preload_cluster=preload_cluster,
            preload_mapping=preload_mapping,
        )


_global_tracker: Optional[DiartSpeakerTracker] = None


def get_speaker_tracker(
    max_speakers: int = 8,
    sv_model_name: Optional[str] = None,
) -> DiartSpeakerTracker:
    """Get or create the global speaker tracker singleton."""
    global _global_tracker
    if _global_tracker is None:
        _global_tracker = DiartSpeakerTracker(
            max_speakers=max_speakers,
            sv_model_name=sv_model_name,
        )
    elif sv_model_name is not None:
        _global_tracker.sv_model_name = normalize_speaker_model_name(sv_model_name)
    return _global_tracker


def reload_speaker_tracker(
    max_speakers: int = 8,
    preload_cluster: bool = False,
    preload_mapping: bool = False,
    sv_model_name: Optional[str] = None,
) -> dict:
    """Reload the global tracker clustering/mapping selection."""
    tracker = get_speaker_tracker(max_speakers=max_speakers, sv_model_name=sv_model_name)
    tracker.max_speakers = max_speakers
    return tracker.reload_embedding_backend(
        preload_cluster=preload_cluster,
        preload_mapping=preload_mapping,
        sv_model_name=sv_model_name,
    )
