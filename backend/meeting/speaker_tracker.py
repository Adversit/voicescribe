"""Real-time speaker diarization using diart.

diart processes audio in a rolling buffer updated every 500ms.
It combines pyannote segmentation + embedding models with
incremental clustering to track speakers in real-time.

The tracker matches diart's anonymous Speaker_N labels against
pre-registered voiceprints using cosine similarity.
"""

import logging
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class SpeakerInfo:
    cluster_id: int
    label: str  # diart label, e.g. "Speaker_0"
    registered_name: Optional[str] = None
    registered_id: Optional[str] = None
    confidence: float = 0.0
    embedding: Optional[np.ndarray] = None

    @property
    def display_name(self) -> str:
        if self.registered_name:
            return self.registered_name
        return f"说话人 {self.cluster_id + 1}"


class DiartSpeakerTracker:
    """Wraps diart for real-time speaker tracking with voiceprint matching."""

    def __init__(
        self,
        max_speakers: int = 8,
        latency: float = 1.0,
        match_threshold: float = 0.6,
    ):
        self.max_speakers = max_speakers
        self.latency = latency
        self.match_threshold = match_threshold
        self.active_speaker: Optional[SpeakerInfo] = None
        self.speakers: dict[int, SpeakerInfo] = {}
        self.known_speakers: dict[str, dict] = {}  # id -> {name, embedding}
        self._pipeline = None

    def _init_pipeline(self):
        """Lazy-init diart pipeline (expensive, loads models)."""
        if self._pipeline is not None:
            return

        try:
            from diart import SpeakerDiarization
            from diart.inference import StreamingInference
            import diart.operators as ops

            config = SpeakerDiarization.HyperParameters(
                tau_active=0.5,
                rho_update=0.3,
                delta_new=1.0,
                max_speakers=self.max_speakers,
            )
            self._pipeline = SpeakerDiarization(config)
            logger.info("[SpeakerTracker] diart pipeline initialized")
        except ImportError:
            logger.warning(
                "[SpeakerTracker] diart not available, "
                "speaker tracking disabled"
            )
        except Exception as e:
            logger.error(f"[SpeakerTracker] Failed to init: {e}")

    def register_known_speaker(
        self,
        name: str,
        speaker_id: str,
        embedding: np.ndarray
    ):
        """Register a known speaker's voiceprint for matching."""
        self.known_speakers[speaker_id] = {
            "name": name,
            "embedding": embedding / np.linalg.norm(embedding),  # normalize
        }
        logger.info(f"[SpeakerTracker] Registered known speaker: {name}")

    def identify_speaker(
        self, embedding: np.ndarray
    ) -> tuple[Optional[str], Optional[str], float]:
        """Match an embedding against known speakers.

        Returns:
            (speaker_id, name, confidence) or (None, None, 0.0)
        """
        if not self.known_speakers:
            return None, None, 0.0

        embedding_norm = embedding / np.linalg.norm(embedding)
        best_id = None
        best_name = None
        best_score = 0.0

        for spk_id, info in self.known_speakers.items():
            score = float(np.dot(embedding_norm, info["embedding"]))
            if score > best_score:
                best_score = score
                best_id = spk_id
                best_name = info["name"]

        if best_score >= self.match_threshold:
            return best_id, best_name, best_score
        return None, None, best_score

    def process_segment(
        self, audio: np.ndarray, start_time: float, end_time: float
    ) -> SpeakerInfo:
        """Identify the speaker for a VAD-segmented audio chunk.

        Falls back to embedding extraction + matching if diart
        pipeline is not available.
        """
        self._init_pipeline()

        # Extract embedding for this segment
        embedding = self._extract_embedding(audio)

        if embedding is not None:
            spk_id, spk_name, confidence = self.identify_speaker(embedding)

            # Find or create cluster
            cluster_id = self._get_or_create_cluster(embedding)

            info = SpeakerInfo(
                cluster_id=cluster_id,
                label=f"Speaker_{cluster_id}",
                registered_name=spk_name,
                registered_id=spk_id,
                confidence=confidence,
                embedding=embedding,
            )
        else:
            # No embedding available, assign unknown
            info = SpeakerInfo(
                cluster_id=len(self.speakers),
                label=f"Speaker_{len(self.speakers)}",
            )

        self.speakers[info.cluster_id] = info
        self.active_speaker = info
        return info

    def _extract_embedding(self, audio: np.ndarray) -> Optional[np.ndarray]:
        """Extract speaker embedding from audio segment."""
        try:
            from pyannote.audio import Inference
            import torch

            if not hasattr(self, "_embedding_model"):
                self._embedding_model = Inference(
                    "pyannote/embedding",
                    window="whole",
                    use_auth_token=True,
                )

            # pyannote expects (channel, samples) tensor
            waveform = torch.from_numpy(audio).float().unsqueeze(0)
            embedding = self._embedding_model(
                {"waveform": waveform, "sample_rate": 16000}
            )
            return np.array(embedding).flatten()
        except Exception as e:
            logger.warning(f"[SpeakerTracker] Embedding extraction failed: {e}")
            return None

    def _get_or_create_cluster(self, embedding: np.ndarray) -> int:
        """Assign embedding to existing cluster or create new one."""
        embedding_norm = embedding / np.linalg.norm(embedding)

        best_cluster = -1
        best_score = 0.0

        for cid, info in self.speakers.items():
            if info.embedding is not None:
                ref = info.embedding / np.linalg.norm(info.embedding)
                score = float(np.dot(embedding_norm, ref))
                if score > best_score:
                    best_score = score
                    best_cluster = cid

        # Threshold for same speaker cluster
        if best_score >= 0.5 and best_cluster >= 0:
            return best_cluster

        # New cluster
        return len(self.speakers)

    def reset(self):
        """Reset tracking state for new session. Keeps known speakers."""
        self.active_speaker = None
        self.speakers.clear()
        self._pipeline = None
        if hasattr(self, "_embedding_model"):
            del self._embedding_model
        logger.info("[SpeakerTracker] State reset")
