"""Real-time speaker tracking for streaming transcription."""

import logging
import os
import tempfile
import wave
from dataclasses import dataclass, field
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
    speaker_labels: list[dict] = field(default_factory=list)
    overlap_detected: bool = False
    overlap_score: float = 0.0
    overlap_reasons: list[str] = field(default_factory=list)
    speaker_spans: list[dict] = field(default_factory=list)

    @property
    def display_name(self) -> str:
        if self.registered_name:
            return self.registered_name
        return f"Speaker {self.cluster_id + 1}"

    @property
    def speaker_id(self) -> str:
        return self.registered_id or self.label

    def get_speaker_labels(self) -> list[dict]:
        if self.speaker_labels:
            return list(self.speaker_labels)
        return [
            {
                "speaker": self.display_name,
                "speaker_id": self.speaker_id,
                "confidence": self.confidence,
                "role": "primary",
            }
        ]

    def get_speaker_spans(self, start_time: float, end_time: float) -> list[dict]:
        if self.speaker_spans:
            return list(self.speaker_spans)
        return [
            {
                "start": start_time,
                "end": end_time,
                "speaker": self.display_name,
                "speaker_id": self.speaker_id,
                "confidence": self.confidence,
                "speakers": self.get_speaker_labels(),
                "overlap_detected": self.overlap_detected,
                "overlap_score": self.overlap_score,
            }
        ]


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
        self.overlap_threshold = 0.65
        self.min_multi_speaker_span_s = 0.8
        self.min_multi_speaker_windows = 2
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
        candidates = self.identify_speaker_candidates(embedding, top_k=1)
        if not candidates:
            return None, None, 0.0

        best = candidates[0]
        if best["confidence"] >= self.match_threshold:
            return best["speaker_id"], best["speaker"], best["confidence"]
        return None, None, best["confidence"]

    def identify_speaker_candidates(
        self,
        embedding: np.ndarray,
        top_k: int = 3,
    ) -> list[dict]:
        """Return ranked registered-speaker candidates for an embedding."""
        if not self.known_speakers:
            return []

        norm = np.linalg.norm(embedding)
        embedding_norm = embedding / norm if norm > 0 else embedding
        ranked: list[dict] = []

        for speaker_id, info in self.known_speakers.items():
            score = float(np.dot(embedding_norm, info["embedding"]))
            ranked.append(
                {
                    "speaker_id": speaker_id,
                    "speaker": info["name"],
                    "confidence": score,
                }
            )

        ranked.sort(key=lambda item: item["confidence"], reverse=True)
        return ranked[: max(1, top_k)]

    def _cosine_similarity(
        self,
        left: Optional[np.ndarray],
        right: Optional[np.ndarray],
    ) -> float:
        if left is None or right is None:
            return 0.0
        left_norm = np.linalg.norm(left)
        right_norm = np.linalg.norm(right)
        if left_norm <= 0 or right_norm <= 0:
            return 0.0
        return float(np.dot(left / left_norm, right / right_norm))

    def _find_preferred_registered_cluster(
        self,
        cluster_embedding: Optional[np.ndarray],
        ranked_candidates: list[dict],
    ) -> Optional[int]:
        """Prefer an existing cluster for the same registered speaker when evidence is close."""
        if cluster_embedding is None or not ranked_candidates:
            return None

        top_candidate = ranked_candidates[0]
        top_candidate_id = top_candidate["speaker_id"]
        top_candidate_conf = float(top_candidate["confidence"])
        if top_candidate_conf < self.match_threshold - 0.08:
            return None

        best_cluster_id: Optional[int] = None
        best_similarity = 0.0

        for cluster_id, info in self.speakers.items():
            if info.registered_id != top_candidate_id:
                continue
            similarity = self._cosine_similarity(cluster_embedding, info.embedding)
            if similarity > best_similarity:
                best_similarity = similarity
                best_cluster_id = cluster_id

        if best_cluster_id is None:
            return None

        active_same_registered = (
            self.active_speaker is not None
            and self.active_speaker.registered_id == top_candidate_id
            and self.active_speaker.cluster_id == best_cluster_id
        )
        required_similarity = 0.32 if active_same_registered else 0.4
        if best_similarity >= required_similarity:
            logger.info(
                "[SpeakerTracker] Reusing registered cluster %s for %s (sim=%.3f, conf=%.3f)",
                best_cluster_id,
                top_candidate["speaker"],
                best_similarity,
                top_candidate_conf,
            )
            return best_cluster_id
        return None

    def _find_continuity_cluster(
        self,
        cluster_embedding: Optional[np.ndarray],
    ) -> Optional[int]:
        """Prefer staying on a recent cluster when similarity is reasonably high."""
        if cluster_embedding is None or not self.speakers:
            return None

        best_cluster_id = None
        best_similarity = 0.0
        for cluster_id, info in self.speakers.items():
            similarity = self._cosine_similarity(cluster_embedding, info.embedding)
            if similarity > best_similarity:
                best_similarity = similarity
                best_cluster_id = cluster_id

        if best_cluster_id is None:
            return None

        active_bias = (
            self.active_speaker is not None
            and self.active_speaker.cluster_id == best_cluster_id
        )
        required_similarity = 0.46 if active_bias else 0.52
        if best_similarity >= required_similarity:
            logger.info(
                "[SpeakerTracker] Keeping continuity on cluster %s (sim=%.3f)",
                best_cluster_id,
                best_similarity,
            )
            return best_cluster_id
        return None

    def _prefer_stable_registered_candidate(
        self,
        default_info: SpeakerInfo,
        ranked_candidates: list[dict],
    ) -> tuple[str, str, float]:
        """Bias subsegment speaker assignment toward the already matched registered speaker."""
        if not default_info.registered_id or not ranked_candidates:
            return "", "", 0.0

        top_candidate = ranked_candidates[0]
        top_id = top_candidate["speaker_id"]
        top_conf = float(top_candidate["confidence"])

        if top_id == default_info.registered_id:
            return top_candidate["speaker"], top_id, top_conf

        default_candidate = next(
            (candidate for candidate in ranked_candidates if candidate["speaker_id"] == default_info.registered_id),
            None,
        )
        if default_candidate is None:
            return "", "", 0.0

        default_conf = float(default_candidate["confidence"])
        if default_conf < self.match_threshold - 0.08:
            return "", "", 0.0

        if top_conf - default_conf <= 0.06:
            logger.info(
                "[SpeakerTracker] Keeping stable registered speaker %s over %s in subsegment "
                "(default=%.3f, top=%.3f)",
                default_info.registered_name or default_info.display_name,
                top_candidate["speaker"],
                default_conf,
                top_conf,
            )
            return default_candidate["speaker"], default_candidate["speaker_id"], default_conf

        return "", "", 0.0

    def _prefer_active_registered_match(
        self,
        ranked_candidates: list[dict],
    ) -> tuple[str, str, float]:
        """Bias whole-segment mapping toward the current registered speaker when evidence is close."""
        if self.active_speaker is None or not self.active_speaker.registered_id or not ranked_candidates:
            return "", "", 0.0

        active_id = self.active_speaker.registered_id
        active_name = self.active_speaker.registered_name or self.active_speaker.display_name
        active_candidate = next(
            (candidate for candidate in ranked_candidates if candidate["speaker_id"] == active_id),
            None,
        )
        if active_candidate is None:
            return "", "", 0.0

        top_candidate = ranked_candidates[0]
        top_conf = float(top_candidate["confidence"])
        active_conf = float(active_candidate["confidence"])
        active_floor = max(0.5, self.match_threshold - 0.1)
        if active_conf < active_floor:
            return "", "", 0.0

        if top_candidate["speaker_id"] == active_id:
            logger.info(
                "[SpeakerTracker] Keeping active registered speaker %s for segment "
                "(conf=%.3f, threshold=%.3f)",
                active_name,
                active_conf,
                self.match_threshold,
            )
            return active_name, active_id, max(active_conf, self.active_speaker.confidence)

        if top_conf - active_conf <= 0.04:
            logger.info(
                "[SpeakerTracker] Preferring active registered speaker %s over %s "
                "(active=%.3f, top=%.3f)",
                active_name,
                top_candidate["speaker"],
                active_conf,
                top_conf,
            )
            return active_name, active_id, max(active_conf, self.active_speaker.confidence)

        return "", "", 0.0

    def _prefer_registered_switch_candidate(
        self,
        ranked_candidates: list[dict],
        current_speaker: Optional[str] = None,
        current_speaker_id: Optional[str] = None,
        context: str = "segment",
    ) -> tuple[str, str, float]:
        """Prefer switching to another registered speaker before falling back to anonymous."""
        if not ranked_candidates:
            return "", "", 0.0

        top_candidate = ranked_candidates[0]
        top_conf = float(top_candidate["confidence"])
        switch_floor = max(0.52, self.match_threshold - 0.06)
        switch_margin = 0.05

        if top_conf < switch_floor:
            return "", "", 0.0

        competitor_conf = 0.0
        competitor_name = "next_candidate"
        if current_speaker_id:
            current_candidate = next(
                (
                    candidate
                    for candidate in ranked_candidates
                    if candidate["speaker_id"] == current_speaker_id
                ),
                None,
            )
            if current_candidate is not None and current_candidate["speaker_id"] != top_candidate["speaker_id"]:
                competitor_conf = float(current_candidate["confidence"])
                competitor_name = str(current_candidate["speaker"])
        if competitor_conf == 0.0 and len(ranked_candidates) >= 2:
            competitor_conf = float(ranked_candidates[1]["confidence"])
            competitor_name = str(ranked_candidates[1]["speaker"])

        if top_conf - competitor_conf < switch_margin:
            return "", "", 0.0

        if current_speaker and current_speaker != top_candidate["speaker"]:
            logger.info(
                "[SpeakerTracker] Switching %s from %s to registered speaker %s "
                "(top=%.3f, competitor=%s:%.3f)",
                context,
                current_speaker,
                top_candidate["speaker"],
                top_conf,
                competitor_name,
                competitor_conf,
            )
        else:
            logger.info(
                "[SpeakerTracker] Selecting decisive registered speaker %s for %s "
                "(top=%.3f, competitor=%s:%.3f)",
                top_candidate["speaker"],
                context,
                top_conf,
                competitor_name,
                competitor_conf,
            )

        return (
            str(top_candidate["speaker"]),
            str(top_candidate["speaker_id"]),
            top_conf,
        )

    def _prefer_stable_span_candidate(
        self,
        last_primary: tuple[str, str, float] | None,
        ranked_candidates: list[dict],
    ) -> tuple[str, str, float]:
        """Prefer continuity across adjacent subsegments for all speakers."""
        if last_primary is None or not ranked_candidates:
            return "", "", 0.0

        last_name, last_id, last_confidence = last_primary
        top_candidate = ranked_candidates[0]
        top_id = top_candidate["speaker_id"]
        top_conf = float(top_candidate["confidence"])

        if top_id == last_id:
            return top_candidate["speaker"], top_id, top_conf

        last_candidate = next(
            (candidate for candidate in ranked_candidates if candidate["speaker_id"] == last_id),
            None,
        )
        if last_candidate is None:
            return "", "", 0.0

        last_candidate_conf = float(last_candidate["confidence"])
        continuity_floor = max(0.38, self.match_threshold - 0.12)
        if last_candidate_conf < continuity_floor:
            return "", "", 0.0

        if top_conf - last_candidate_conf <= 0.08:
            logger.info(
                "[SpeakerTracker] Keeping span continuity %s over %s "
                "(prev=%.3f, top=%.3f)",
                last_name,
                top_candidate["speaker"],
                last_candidate_conf,
                top_conf,
            )
            return last_candidate["speaker"], last_candidate["speaker_id"], max(
                last_candidate_conf,
                last_confidence,
            )

        return "", "", 0.0

    def process_segment(
        self,
        audio: np.ndarray,
        start_time: float,
        end_time: float,
        transcript_text: Optional[str] = None,
    ) -> SpeakerInfo:
        """Cluster the segment first, then map that cluster to registered speakers."""
        cluster_embedding = self._extract_cluster_embedding(audio)
        mapping_embedding = self._extract_mapping_embedding(audio)
        cluster_source = cluster_embedding if cluster_embedding is not None else mapping_embedding
        ranked_candidates = (
            self.identify_speaker_candidates(mapping_embedding, top_k=3)
            if mapping_embedding is not None
            else []
        )
        logger.info(
            "[SpeakerTracker] Segment %.2f-%.2f candidates: %s",
            start_time,
            end_time,
            self._format_ranked_candidates(ranked_candidates),
        )

        if cluster_source is not None:
            preferred_cluster_id = self._find_preferred_registered_cluster(
                cluster_source,
                ranked_candidates,
            )
            continuity_cluster_id = self._find_continuity_cluster(cluster_source)
            cluster_id = (
                preferred_cluster_id
                if preferred_cluster_id is not None
                else continuity_cluster_id
                if continuity_cluster_id is not None
                else self._get_or_create_cluster(cluster_source)
            )
            if ranked_candidates:
                top_candidate = ranked_candidates[0]
                confidence = float(top_candidate["confidence"])
                active_name, active_id, active_confidence = self._prefer_active_registered_match(
                    ranked_candidates,
                )
                if confidence >= self.match_threshold:
                    spk_id = top_candidate["speaker_id"]
                    spk_name = top_candidate["speaker"]
                    logger.info(
                        "[SpeakerTracker] Segment %.2f-%.2f matched registered speaker %s "
                        "(id=%s, conf=%.3f, threshold=%.3f)",
                        start_time,
                        end_time,
                        spk_name,
                        spk_id,
                        confidence,
                        self.match_threshold,
                    )
                elif active_id:
                    spk_id = active_id
                    spk_name = active_name
                    confidence = active_confidence
                    logger.info(
                        "[SpeakerTracker] Segment %.2f-%.2f staying on active registered speaker %s "
                        "(id=%s, conf=%.3f)",
                        start_time,
                        end_time,
                        spk_name,
                        spk_id,
                        confidence,
                    )
                else:
                    switch_name, switch_id, switch_confidence = self._prefer_registered_switch_candidate(
                        ranked_candidates,
                        current_speaker=(
                            self.active_speaker.display_name if self.active_speaker is not None else None
                        ),
                        current_speaker_id=(
                            self.active_speaker.speaker_id if self.active_speaker is not None else None
                        ),
                        context="segment",
                    )
                    if switch_id:
                        spk_id = switch_id
                        spk_name = switch_name
                        confidence = switch_confidence
                        logger.info(
                            "[SpeakerTracker] Segment %.2f-%.2f switching to registered speaker %s "
                            "(id=%s, conf=%.3f) despite threshold %.3f",
                            start_time,
                            end_time,
                            spk_name,
                            spk_id,
                            confidence,
                            self.match_threshold,
                        )
                    else:
                        spk_id, spk_name = (None, None)
                        logger.info(
                            "[SpeakerTracker] Segment %.2f-%.2f top candidate %s below threshold "
                            "(conf=%.3f, threshold=%.3f)",
                            start_time,
                            end_time,
                            top_candidate["speaker"],
                            confidence,
                            self.match_threshold,
                        )
            else:
                spk_id, spk_name, confidence = (None, None, 0.0)
                logger.info(
                    "[SpeakerTracker] Segment %.2f-%.2f has no registered speaker candidates",
                    start_time,
                    end_time,
                )

            if spk_id is None:
                existing = self.speakers.get(cluster_id)
                if existing and existing.registered_id:
                    spk_id = existing.registered_id
                    spk_name = existing.registered_name
                    confidence = max(confidence, existing.confidence)
                    logger.info(
                        "[SpeakerTracker] Segment %.2f-%.2f inheriting registered speaker %s "
                        "from cluster %s (conf=%.3f)",
                        start_time,
                        end_time,
                        spk_name,
                        cluster_id,
                        confidence,
                    )
                else:
                    logger.info(
                        "[SpeakerTracker] Segment %.2f-%.2f remains anonymous on cluster %s",
                        start_time,
                        end_time,
                        cluster_id,
                    )

            overlap_score, overlap_reasons = self._estimate_overlap(
                ranked_candidates=ranked_candidates,
                primary_confidence=confidence,
                segment_duration=max(0.0, end_time - start_time),
                transcript_text=transcript_text,
            )
            overlap_detected = overlap_score >= self.overlap_threshold and len(ranked_candidates) >= 2
            speaker_labels = self._build_speaker_labels(
                cluster_id=cluster_id,
                cluster_label=f"Speaker_{cluster_id}",
                registered_id=spk_id,
                registered_name=spk_name,
                confidence=confidence,
                ranked_candidates=ranked_candidates,
                overlap_detected=overlap_detected,
            )
            info = SpeakerInfo(
                cluster_id=cluster_id,
                label=f"Speaker_{cluster_id}",
                registered_name=spk_name,
                registered_id=spk_id,
                confidence=confidence,
                embedding=cluster_source,
                speaker_labels=speaker_labels,
                overlap_detected=overlap_detected,
                overlap_score=overlap_score,
                overlap_reasons=overlap_reasons,
            )
            info.speaker_spans = self._build_speaker_spans(
                audio=audio,
                start_time=start_time,
                end_time=end_time,
                default_info=info,
                transcript_text=transcript_text,
            )
            (
                info.speaker_spans,
                info.speaker_labels,
                info.overlap_detected,
                info.overlap_score,
                info.overlap_reasons,
            ) = self._finalize_segment_output(
                default_info=info,
                raw_spans=info.speaker_spans,
                start_time=start_time,
                end_time=end_time,
                raw_overlap_detected=overlap_detected,
                raw_overlap_score=overlap_score,
                raw_overlap_reasons=overlap_reasons,
            )
        else:
            info = SpeakerInfo(
                cluster_id=0,
                label="Speaker_0",
                speaker_labels=[
                    {
                        "speaker": "Speaker 1",
                        "speaker_id": "Speaker_0",
                        "confidence": 0.0,
                        "role": "primary",
                    }
                ],
                overlap_detected=False,
                overlap_score=0.0,
            )
            info.speaker_spans = info.get_speaker_spans(start_time, end_time)

        self.speakers[info.cluster_id] = info
        self.active_speaker = info
        return info

    def _build_speaker_spans(
        self,
        audio: np.ndarray,
        start_time: float,
        end_time: float,
        default_info: SpeakerInfo,
        transcript_text: Optional[str],
    ) -> list[dict]:
        duration = max(0.0, end_time - start_time)
        if duration <= 0.0 or len(self.known_speakers) < 2:
            return default_info.get_speaker_spans(start_time, end_time)

        sample_rate = 16000
        window_s = 1.2 if duration >= 3.0 else 0.8
        hop_s = 0.6 if duration >= 3.0 else 0.4
        min_window_s = min(0.6, duration)

        if duration < min_window_s or len(audio) < int(sample_rate * min_window_s):
            return default_info.get_speaker_spans(start_time, end_time)

        windows: list[dict] = []
        last_primary: tuple[str, str, float] | None = (
            default_info.display_name,
            default_info.speaker_id,
            default_info.confidence,
        )
        total_samples = len(audio)
        window_samples = max(int(window_s * sample_rate), 1)
        hop_samples = max(int(hop_s * sample_rate), 1)
        min_window_samples = max(int(min_window_s * sample_rate), 1)

        offset = 0
        while offset < total_samples:
            end_offset = min(total_samples, offset + window_samples)
            if end_offset - offset < min_window_samples:
                if windows:
                    break
                offset = max(0, total_samples - min_window_samples)
                end_offset = total_samples

            window_audio = audio[offset:end_offset]
            if len(window_audio) < min_window_samples:
                break

            window_embedding = self._extract_mapping_embedding(window_audio)
            ranked = (
                self.identify_speaker_candidates(window_embedding, top_k=3)
                if window_embedding is not None
                else []
            )

            if ranked:
                top_candidate = ranked[0]
                preferred_name, preferred_id, preferred_confidence = self._prefer_stable_registered_candidate(
                    default_info,
                    ranked,
                )
                continuity_name, continuity_id, continuity_confidence = self._prefer_stable_span_candidate(
                    last_primary,
                    ranked,
                )
                if preferred_id:
                    primary_name = preferred_name
                    primary_id = preferred_id
                    primary_confidence = preferred_confidence
                elif continuity_id:
                    primary_name = continuity_name
                    primary_id = continuity_id
                    primary_confidence = continuity_confidence
                else:
                    switch_name, switch_id, switch_confidence = self._prefer_registered_switch_candidate(
                        ranked,
                        current_speaker=last_primary[0] if last_primary is not None else default_info.display_name,
                        current_speaker_id=last_primary[1] if last_primary is not None else default_info.speaker_id,
                        context="subsegment",
                    )
                    if switch_id:
                        primary_name = switch_name
                        primary_id = switch_id
                        primary_confidence = switch_confidence
                    else:
                        primary_name = (
                            top_candidate["speaker"]
                            if float(top_candidate["confidence"]) >= self.match_threshold - 0.05
                            else default_info.display_name
                        )
                        primary_id = (
                            top_candidate["speaker_id"]
                            if float(top_candidate["confidence"]) >= self.match_threshold - 0.05
                            else default_info.speaker_id
                        )
                        primary_confidence = max(
                            float(top_candidate["confidence"]),
                            default_info.confidence if primary_id == default_info.speaker_id else 0.0,
                        )
                overlap_score, _ = self._estimate_overlap(
                    ranked_candidates=ranked,
                    primary_confidence=primary_confidence,
                    segment_duration=(end_offset - offset) / sample_rate,
                    transcript_text=transcript_text,
                )
                overlap_detected = overlap_score >= self.overlap_threshold and len(ranked) >= 2
                labels = self._build_candidate_labels(
                    default_speaker=primary_name,
                    default_speaker_id=primary_id,
                    confidence=primary_confidence,
                    ranked_candidates=ranked,
                    overlap_detected=overlap_detected,
                    allow_secondary_labels=False,
                )
            else:
                primary_name = default_info.display_name
                primary_id = default_info.speaker_id
                primary_confidence = default_info.confidence
                overlap_detected = False
                overlap_score = 0.0
                labels = default_info.get_speaker_labels()

            windows.append(
                {
                    "start": start_time + offset / sample_rate,
                    "end": start_time + end_offset / sample_rate,
                    "speaker": primary_name,
                    "speaker_id": primary_id,
                    "confidence": primary_confidence,
                    "speakers": labels,
                    "overlap_detected": overlap_detected,
                    "overlap_score": overlap_score,
                    "window_count": 1,
                }
            )
            last_primary = (primary_name, primary_id, primary_confidence)

            if end_offset >= total_samples:
                break
            offset += hop_samples

        if not windows:
            return default_info.get_speaker_spans(start_time, end_time)

        return self._merge_speaker_spans(windows, start_time, end_time, default_info)

    def _build_speaker_labels(
        self,
        cluster_id: int,
        cluster_label: str,
        registered_id: Optional[str],
        registered_name: Optional[str],
        confidence: float,
        ranked_candidates: list[dict],
        overlap_detected: bool = False,
    ) -> list[dict]:
        labels = self._build_candidate_labels(
            default_speaker=registered_name or f"Speaker {cluster_id + 1}",
            default_speaker_id=registered_id or cluster_label,
            confidence=confidence,
            ranked_candidates=ranked_candidates,
            overlap_detected=overlap_detected,
        )

        return labels

    def _build_candidate_labels(
        self,
        default_speaker: str,
        default_speaker_id: str,
        confidence: float,
        ranked_candidates: list[dict],
        overlap_detected: bool = False,
        allow_secondary_labels: bool = True,
    ) -> list[dict]:
        labels = [
            {
                "speaker": default_speaker,
                "speaker_id": default_speaker_id,
                "confidence": confidence,
                "role": "primary",
            }
        ]

        if not ranked_candidates:
            return labels
        if not allow_secondary_labels:
            return labels

        top_confidence = float(ranked_candidates[0]["confidence"])
        for candidate in ranked_candidates:
            candidate_id = candidate["speaker_id"]
            if candidate_id == labels[0]["speaker_id"]:
                continue

            candidate_confidence = float(candidate["confidence"])
            close_to_primary = top_confidence - candidate_confidence <= (
                0.12 if overlap_detected else 0.08
            )
            above_secondary_floor = candidate_confidence >= max(
                0.3 if overlap_detected else 0.35,
                self.match_threshold - (0.2 if overlap_detected else 0.15),
            )
            if not (close_to_primary and above_secondary_floor):
                continue

            labels.append(
                {
                    "speaker": candidate["speaker"],
                    "speaker_id": candidate_id,
                    "confidence": candidate_confidence,
                    "role": "secondary",
                }
            )
            if len(labels) >= 3:
                break

        return labels

    def _merge_speaker_spans(
        self,
        spans: list[dict],
        start_time: float,
        end_time: float,
        default_info: SpeakerInfo,
    ) -> list[dict]:
        merged: list[dict] = []
        for span in spans:
            if (
                merged
                and merged[-1]["speaker_id"] == span["speaker_id"]
                and merged[-1]["overlap_detected"] == span["overlap_detected"]
            ):
                merged[-1]["end"] = span["end"]
                merged[-1]["confidence"] = max(merged[-1]["confidence"], span["confidence"])
                merged[-1]["window_count"] = int(merged[-1].get("window_count", 1)) + int(
                    span.get("window_count", 1)
                )
                if span["overlap_score"] > merged[-1]["overlap_score"]:
                    merged[-1]["overlap_score"] = span["overlap_score"]
                    merged[-1]["speakers"] = span["speakers"]
            else:
                merged.append(dict(span))

        if len(merged) == 1:
            merged[0]["start"] = start_time
            merged[0]["end"] = end_time
            return merged

        min_span = 0.35
        normalized: list[dict] = []
        for span in merged:
            if span["end"] - span["start"] < min_span and normalized:
                normalized[-1]["end"] = span["end"]
                normalized[-1]["confidence"] = max(normalized[-1]["confidence"], span["confidence"])
                normalized[-1]["window_count"] = int(
                    normalized[-1].get("window_count", 1)
                ) + int(span.get("window_count", 1))
                if span["overlap_score"] > normalized[-1]["overlap_score"]:
                    normalized[-1]["overlap_score"] = span["overlap_score"]
                    normalized[-1]["speakers"] = span["speakers"]
                continue
            normalized.append(span)

        if not normalized:
            return default_info.get_speaker_spans(start_time, end_time)

        normalized[0]["start"] = start_time
        normalized[-1]["end"] = end_time
        return normalized

    def _format_ranked_candidates(self, ranked_candidates: list[dict]) -> str:
        if not ranked_candidates:
            return "none"
        return ", ".join(
            f"{candidate['speaker']}:{float(candidate['confidence']):.3f}"
            for candidate in ranked_candidates
        )

    def _summarize_spans(self, spans: list[dict]) -> str:
        if not spans:
            return "none"
        return ", ".join(
            (
                f"{span.get('speaker')}:{float(span.get('end', 0.0)) - float(span.get('start', 0.0)):.2f}s/"
                f"{float(span.get('confidence', 0.0)):.3f}/w{int(span.get('window_count', 1))}"
            )
            for span in spans
        )

    def _build_primary_only_labels(
        self,
        speaker: str,
        speaker_id: str,
        confidence: float,
    ) -> list[dict]:
        return [
            {
                "speaker": speaker,
                "speaker_id": speaker_id,
                "confidence": confidence,
                "role": "primary",
            }
        ]

    def _is_stable_multi_speaker_span(
        self,
        span: dict,
    ) -> bool:
        duration = float(span.get("end", 0.0)) - float(span.get("start", 0.0))
        confidence = float(span.get("confidence", 0.0))
        window_count = int(span.get("window_count", 1))
        confidence_floor = max(0.55, self.match_threshold - 0.02)
        return (
            duration >= self.min_multi_speaker_span_s
            and window_count >= self.min_multi_speaker_windows
            and confidence >= confidence_floor
        )

    def _build_segment_labels_from_spans(
        self,
        spans: list[dict],
        fallback_info: SpeakerInfo,
    ) -> list[dict]:
        aggregated: dict[str, dict] = {}
        for span in spans:
            speaker_id = str(span.get("speaker_id", ""))
            if not speaker_id:
                continue
            duration = max(0.0, float(span.get("end", 0.0)) - float(span.get("start", 0.0)))
            info = aggregated.setdefault(
                speaker_id,
                {
                    "speaker": str(span.get("speaker", fallback_info.display_name)),
                    "speaker_id": speaker_id,
                    "confidence": float(span.get("confidence", fallback_info.confidence)),
                    "duration": 0.0,
                },
            )
            info["duration"] += duration
            info["confidence"] = max(info["confidence"], float(span.get("confidence", 0.0)))

        if not aggregated:
            return self._build_primary_only_labels(
                fallback_info.display_name,
                fallback_info.speaker_id,
                fallback_info.confidence,
            )

        ordered = sorted(
            aggregated.values(),
            key=lambda item: (item["duration"], item["confidence"]),
            reverse=True,
        )
        labels: list[dict] = []
        for index, item in enumerate(ordered[:3]):
            labels.append(
                {
                    "speaker": item["speaker"],
                    "speaker_id": item["speaker_id"],
                    "confidence": item["confidence"],
                    "role": "primary" if index == 0 else "secondary",
                }
            )
        return labels

    def _finalize_segment_output(
        self,
        default_info: SpeakerInfo,
        raw_spans: list[dict],
        start_time: float,
        end_time: float,
        raw_overlap_detected: bool,
        raw_overlap_score: float,
        raw_overlap_reasons: list[str],
    ) -> tuple[list[dict], list[dict], bool, float, list[str]]:
        if not raw_spans:
            fallback_spans = default_info.get_speaker_spans(start_time, end_time)
            fallback_labels = self._build_primary_only_labels(
                default_info.display_name,
                default_info.speaker_id,
                default_info.confidence,
            )
            return fallback_spans, fallback_labels, False, 0.0, []

        stable_spans = [span for span in raw_spans if self._is_stable_multi_speaker_span(span)]
        stable_speaker_ids = {str(span.get("speaker_id", "")) for span in stable_spans if span.get("speaker_id")}

        if len(stable_speaker_ids) < 2:
            logger.info(
                "[SpeakerTracker] Collapsing segment %.2f-%.2f to single speaker %s; "
                "raw_overlap=%s(%.2f) raw_spans=%s stable_spans=%s reasons=%s",
                start_time,
                end_time,
                default_info.display_name,
                raw_overlap_detected,
                raw_overlap_score,
                self._summarize_spans(raw_spans),
                self._summarize_spans(stable_spans),
                ",".join(raw_overlap_reasons) or "none",
            )
            fallback_spans = [
                {
                    "start": start_time,
                    "end": end_time,
                    "speaker": default_info.display_name,
                    "speaker_id": default_info.speaker_id,
                    "confidence": default_info.confidence,
                    "speakers": self._build_primary_only_labels(
                        default_info.display_name,
                        default_info.speaker_id,
                        default_info.confidence,
                    ),
                    "overlap_detected": False,
                    "overlap_score": 0.0,
                    "window_count": sum(int(span.get("window_count", 1)) for span in raw_spans),
                }
            ]
            return fallback_spans, fallback_spans[0]["speakers"], False, 0.0, []

        finalized_spans: list[dict] = []
        for span in stable_spans:
            copied = dict(span)
            copied["speakers"] = self._build_primary_only_labels(
                str(copied.get("speaker", default_info.display_name)),
                str(copied.get("speaker_id", default_info.speaker_id)),
                float(copied.get("confidence", default_info.confidence)),
            )
            copied["overlap_detected"] = False
            copied["overlap_score"] = 0.0
            finalized_spans.append(copied)

        logger.info(
            "[SpeakerTracker] Accepting multi-speaker segment %.2f-%.2f with stable spans: %s",
            start_time,
            end_time,
            self._summarize_spans(stable_spans),
        )
        return (
            finalized_spans,
            self._build_segment_labels_from_spans(stable_spans, default_info),
            False,
            0.0,
            [],
        )

    def _estimate_overlap(
        self,
        ranked_candidates: list[dict],
        primary_confidence: float,
        segment_duration: float,
        transcript_text: Optional[str],
    ) -> tuple[float, list[str]]:
        """Estimate whether this segment likely contains overlapping speakers."""
        score = 0.0
        reasons: list[str] = []

        if len(ranked_candidates) >= 2:
            top_confidence = float(ranked_candidates[0]["confidence"])
            second_confidence = float(ranked_candidates[1]["confidence"])
            gap = top_confidence - second_confidence

            if second_confidence >= max(0.4, self.match_threshold - 0.15):
                score += 0.3
                reasons.append("strong_secondary_candidate")
            if gap <= 0.03:
                score += 0.4
                reasons.append("top2_gap_very_small")
            elif gap <= 0.08:
                score += 0.25
                reasons.append("top2_gap_small")

        if primary_confidence < self.match_threshold + 0.05 and len(ranked_candidates) >= 2:
            score += 0.1
            reasons.append("primary_confidence_borderline")

        if segment_duration >= 4.0 and len(ranked_candidates) >= 2:
            score += 0.1
            reasons.append("long_segment")

        if transcript_text:
            text = "".join(str(transcript_text).split())
            if len(text) >= 20 and len(ranked_candidates) >= 2:
                repeated = self._has_repeated_phrase(text)
                if repeated:
                    score += 0.1
                    reasons.append("repeated_phrase")

        return min(score, 1.0), reasons

    def _has_repeated_phrase(self, text: str) -> bool:
        """Detect simple repeated fragments often seen in interruptions or restarts."""
        for size in range(2, 7):
            seen: set[str] = set()
            for index in range(0, max(0, len(text) - size + 1)):
                chunk = text[index : index + size]
                if chunk in seen:
                    return True
                seen.add(chunk)
        return False

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

        active_cluster_id = self.active_speaker.cluster_id if self.active_speaker is not None else None
        active_bonus = best_cluster == active_cluster_id and active_cluster_id is not None
        required_score = 0.5 if active_bonus else 0.58
        if best_score >= required_score and best_cluster >= 0:
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
