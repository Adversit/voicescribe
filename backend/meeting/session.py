"""Meeting session orchestrator.

Manages the lifecycle of a meeting recording session:
VAD segmentation -> ASR transcription -> speaker clustering -> speaker mapping.
"""

import logging
import re
import time
import uuid
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class SessionConfig:
    engine: str = "firered"
    model: str = "firered-aed-l"
    language: str = "zh"
    speakers_enabled: bool = True
    hotwords: str = ""
    enable_ai_refine: bool = True
    enable_ai_summary: bool = True
    summary_interval: int = 120  # seconds
    max_speakers: int = 8
    llm_provider: str = "claude_cli"
    llm_model: str = "haiku"


@dataclass
class Utterance:
    id: str
    speaker: str
    speaker_id: str
    text: str
    start: float
    end: float
    confidence: float
    speakers: list[dict] = field(default_factory=list)
    overlap_detected: bool = False
    overlap_score: float = 0.0
    speaker_spans: list[dict] = field(default_factory=list)
    refined_text: Optional[str] = None

    @property
    def speaker_display(self) -> str:
        if self.speakers:
            return " / ".join(item.get("speaker", self.speaker) for item in self.speakers)
        return self.speaker

    def to_dict(self) -> dict:
        return {
            "type": "utterance",
            "id": self.id,
            "speaker": self.speaker,
            "speaker_id": self.speaker_id,
            "speakers": list(self.speakers),
            "overlap_detected": self.overlap_detected,
            "overlap_score": self.overlap_score,
            "speaker_spans": list(self.speaker_spans),
            "text": self.refined_text or self.text,
            "original_text": self.text if self.refined_text else None,
            "start": self.start,
            "end": self.end,
            "confidence": self.confidence,
        }


class MeetingSession:
    """Orchestrates a meeting recording session."""

    def __init__(self, config: SessionConfig):
        self.config = config
        self.session_id = str(uuid.uuid4())[:8]
        self.start_time = time.time()
        self.utterances: list[Utterance] = []
        self.running_summary: str = ""
        self._utterance_counter = 0

        self._vad = None
        self._speaker_tracker = None
        self._refiner = None
        self._summarizer = None
        self.asr_engine = None

        logger.info(
            "[MeetingSession] Created session %s engine=%s speakers=%s",
            self.session_id,
            config.engine,
            config.speakers_enabled,
        )

    @property
    def vad(self):
        if self._vad is None:
            from meeting.vad import SileroVADSegmenter, VADConfig

            self._vad = SileroVADSegmenter(VADConfig())
        return self._vad

    @property
    def speaker_tracker(self):
        if self._speaker_tracker is None and self.config.speakers_enabled:
            from meeting.speaker_tracker import get_speaker_tracker

            self._speaker_tracker = get_speaker_tracker(
                max_speakers=self.config.max_speakers
            )
            self._speaker_tracker.reset()
        return self._speaker_tracker

    @property
    def refiner(self):
        if self._refiner is None:
            from postprocess.ai_refiner import AIRefiner

            self._refiner = AIRefiner(
                provider=self.config.llm_provider,
                model=self.config.llm_model,
            )
        return self._refiner

    @property
    def summarizer(self):
        if self._summarizer is None:
            from meeting.summarizer import MeetingSummarizer

            self._summarizer = MeetingSummarizer(
                refiner=self.refiner,
                interval=self.config.summary_interval,
            )
        return self._summarizer

    async def refine_utterance(self, utterance: Utterance) -> Optional[str]:
        """Refine an utterance with AI."""
        hotwords = [item.strip() for item in self.config.hotwords.split(",") if item.strip()]
        refined = await self.refiner.refine(utterance.text, hotwords)
        if refined != utterance.text:
            utterance.refined_text = refined
            return refined
        return None

    def set_asr_engine(self, engine):
        """Set the ASR engine (loaded externally)."""
        self.asr_engine = engine

    def load_registered_speakers(self, speakers: list[dict]):
        """Load pre-registered speakers for mapping."""
        if not self.speaker_tracker:
            return

        for speaker in speakers:
            self.speaker_tracker.register_known_speaker(
                name=speaker["name"],
                speaker_id=speaker["id"],
                embedding=speaker["embedding"],
            )

    def _next_utterance_id(self) -> str:
        self._utterance_counter += 1
        return f"utt_{self._utterance_counter:04d}"

    def _build_utterance(
        self,
        *,
        text: str,
        start: float,
        end: float,
        speaker_name: str,
        speaker_id: str,
        confidence: float,
        speakers: list[dict],
        overlap_detected: bool,
        overlap_score: float,
        speaker_spans: list[dict],
    ) -> Utterance:
        return Utterance(
            id=self._next_utterance_id(),
            speaker=speaker_name,
            speaker_id=speaker_id,
            speakers=speakers,
            text=text,
            start=start,
            end=end,
            confidence=confidence,
            overlap_detected=overlap_detected,
            overlap_score=overlap_score,
            speaker_spans=speaker_spans,
        )

    def _derive_split_spans(
        self,
        raw_spans: list[dict],
        segment_start: float,
        segment_end: float,
    ) -> list[dict]:
        if len(raw_spans) < 2:
            return []

        sorted_spans = sorted(
            raw_spans,
            key=lambda item: (float(item.get("start", segment_start)), float(item.get("end", segment_end))),
        )

        normalized: list[dict] = []
        current_start = segment_start
        for index, span in enumerate(sorted_spans):
            next_span = sorted_spans[index + 1] if index + 1 < len(sorted_spans) else None
            if next_span is not None:
                current_end = float(span.get("end", segment_end))
                next_start = float(next_span.get("start", current_end))
                if current_end > next_start:
                    boundary = (current_end + next_start) / 2.0
                else:
                    boundary = current_end
            else:
                boundary = segment_end

            start = max(segment_start, current_start)
            end = min(segment_end, boundary)
            if end - start < 0.35:
                current_start = max(current_start, end)
                continue

            copied = dict(span)
            copied["start"] = start
            copied["end"] = end
            normalized.append(copied)
            current_start = end

        merged: list[dict] = []
        for span in normalized:
            if (
                merged
                and merged[-1].get("speaker_id") == span.get("speaker_id")
                and merged[-1].get("overlap_detected") == span.get("overlap_detected")
            ):
                merged[-1]["end"] = span["end"]
                merged[-1]["confidence"] = max(
                    float(merged[-1].get("confidence", 0.0)),
                    float(span.get("confidence", 0.0)),
                )
                continue
            merged.append(span)

        if len({span.get("speaker_id") for span in merged}) < 2:
            return []

        return merged

    def _slice_audio_for_span(self, audio: np.ndarray, span: dict, segment_start: float) -> np.ndarray:
        sample_rate = 16000
        start_offset = max(0, int((float(span["start"]) - segment_start) * sample_rate))
        end_offset = min(len(audio), int((float(span["end"]) - segment_start) * sample_rate))
        if end_offset <= start_offset:
            return np.array([], dtype=np.float32)
        return audio[start_offset:end_offset]

    def _is_anonymous_speaker(self, speaker_id: str) -> bool:
        return speaker_id == "unknown" or speaker_id.startswith("Speaker_")

    def _should_drop_utterance(self, utterance: Utterance) -> bool:
        text = (utterance.text or "").strip()
        normalized = re.sub(r"\s+", "", text)
        duration = max(0.0, utterance.end - utterance.start)
        anonymous = self._is_anonymous_speaker(utterance.speaker_id)

        if not normalized:
            logger.info(
                "[MeetingSession] Dropping empty utterance speaker=%s duration=%.2fs",
                utterance.speaker,
                duration,
            )
            return True

        if not anonymous:
            return False

        filler_tokens = {
            "嗯",
            "啊",
            "哦",
            "呃",
            "哎",
            "欸",
            "唉",
            "哈",
            "嘿",
            "喂",
            "来",
            "来来",
            "来来来",
        }
        punctuation_only = re.fullmatch(r"[\W_]+", normalized) is not None
        repeated_single = len(set(normalized)) == 1 and len(normalized) <= 4
        very_short_filler = normalized in filler_tokens or repeated_single

        if punctuation_only:
            logger.info(
                "[MeetingSession] Dropping punctuation-only anonymous utterance duration=%.2fs",
                duration,
            )
            return True

        if duration <= 1.2 and (len(normalized) <= 1 or very_short_filler):
            logger.info(
                "[MeetingSession] Dropping short anonymous filler utterance text=%s duration=%.2fs",
                normalized,
                duration,
            )
            return True

        return False

    async def process_audio_segment(self, segment) -> list[Utterance]:
        """Process one VAD segment and return one or more utterances."""
        if self.asr_engine is None:
            raise RuntimeError("ASR engine not set")

        result = self.asr_engine.transcribe_array(
            segment.audio,
            sample_rate=16000,
            hotwords=self.config.hotwords,
        )

        if self.speaker_tracker:
            speaker_info = self.speaker_tracker.process_segment(
                segment.audio,
                segment.start_time,
                segment.end_time,
                transcript_text=result["text"],
            )
            speaker_name = speaker_info.display_name
            speaker_id = speaker_info.speaker_id
            speakers = speaker_info.get_speaker_labels()
            confidence = speaker_info.confidence
            overlap_detected = speaker_info.overlap_detected
            overlap_score = speaker_info.overlap_score
            speaker_spans = speaker_info.get_speaker_spans(
                segment.start_time,
                segment.end_time,
            )
        else:
            speaker_name = "Speaker"
            speaker_id = "unknown"
            speakers = [
                {
                    "speaker": speaker_name,
                    "speaker_id": speaker_id,
                    "confidence": 0.0,
                    "role": "primary",
                }
            ]
            confidence = 0.0
            overlap_detected = False
            overlap_score = 0.0
            speaker_spans = [
                {
                    "start": segment.start_time,
                    "end": segment.end_time,
                    "speaker": speaker_name,
                    "speaker_id": speaker_id,
                    "confidence": confidence,
                    "speakers": speakers,
                    "overlap_detected": False,
                    "overlap_score": 0.0,
                }
            ]

        split_spans = self._derive_split_spans(
            speaker_spans,
            segment.start_time,
            segment.end_time,
        )

        utterances: list[Utterance] = []
        if split_spans:
            logger.info(
                "[MeetingSession] Splitting VAD segment %.2f-%.2f into %d speaker spans",
                segment.start_time,
                segment.end_time,
                len(split_spans),
            )
            for span in split_spans:
                if span.get("overlap_detected"):
                    continue
                span_audio = self._slice_audio_for_span(segment.audio, span, segment.start_time)
                if len(span_audio) < int(0.35 * 16000):
                    continue
                span_result = self.asr_engine.transcribe_array(
                    span_audio,
                    sample_rate=16000,
                    hotwords=self.config.hotwords,
                )
                span_text = str(span_result.get("text", "")).strip()
                if not span_text:
                    continue
                span_speakers = list(span.get("speakers", speakers))
                utterances.append(
                    self._build_utterance(
                        text=span_text,
                        start=float(span["start"]),
                        end=float(span["end"]),
                        speaker_name=str(span.get("speaker", speaker_name)),
                        speaker_id=str(span.get("speaker_id", speaker_id)),
                        confidence=float(span.get("confidence", confidence)),
                        speakers=span_speakers,
                        overlap_detected=bool(span.get("overlap_detected", False)),
                        overlap_score=float(span.get("overlap_score", 0.0)),
                        speaker_spans=[dict(span)],
                    )
                )

        if not utterances:
            utterances = [
                self._build_utterance(
                    text=result["text"],
                    start=segment.start_time,
                    end=segment.end_time,
                    speaker_name=speaker_name,
                    speaker_id=speaker_id,
                    confidence=confidence,
                    speakers=speakers,
                    overlap_detected=overlap_detected,
                    overlap_score=overlap_score,
                    speaker_spans=speaker_spans,
                )
            ]

        utterances = [item for item in utterances if not self._should_drop_utterance(item)]
        if not utterances:
            logger.info(
                "[MeetingSession] Segment %.2f-%.2f produced no retained utterances after filtering",
                segment.start_time,
                segment.end_time,
            )
            return []

        utterances.sort(key=lambda item: (item.start, item.end, item.id))
        for utterance in utterances:
            self.add_utterance(utterance)
        return utterances

    def add_utterance(self, utterance: Utterance):
        """Add an utterance to the session."""
        self.utterances.append(utterance)

    def get_plain_text(self) -> str:
        """Get all utterances as plain text."""
        return "\n".join(item.refined_text or item.text for item in self.utterances)

    def get_formatted_text(
        self,
        include_speakers: bool = False,
        include_summary: bool = False,
    ) -> str:
        """Get formatted text based on output preferences."""
        lines = []

        for utterance in self.utterances:
            text = utterance.refined_text or utterance.text
            if include_speakers:
                lines.append(f"[{utterance.speaker_display}] {text}")
            else:
                lines.append(text)

        result = "\n".join(lines)

        if include_summary and self.running_summary:
            result += f"\n\n---\n{self.running_summary}"

        return result

    def get_recent_transcript(self, since_utterance: int = 0) -> str:
        """Get transcript since a given utterance index, for summarization."""
        recent = self.utterances[since_utterance:]
        return "\n".join(
            f"[{item.speaker_display}] {item.refined_text or item.text}" for item in recent
        )

    def get_session_data(self) -> dict:
        """Get complete session data for history storage."""
        summary_payload = None
        if self.running_summary:
            decisions: list[str] = []
            action_items: list[dict] = []
            if self._summarizer is not None:
                decisions = list(self._summarizer.decisions)
                action_items = list(self._summarizer.action_items)
            summary_payload = {
                "content": self.running_summary,
                "decisions": decisions,
                "action_items": action_items,
            }

        return {
            "session_id": self.session_id,
            "timestamp": self.start_time,
            "duration": time.time() - self.start_time,
            "engine": self.config.engine,
            "utterances": [item.to_dict() for item in self.utterances],
            "summary": summary_payload,
            "plain_text": self.get_plain_text(),
        }

    def cleanup(self):
        """Clean up resources."""
        if self._vad is not None:
            self._vad.reset()
        if self._speaker_tracker is not None:
            self._speaker_tracker.reset()
        logger.info("[MeetingSession] Session %s cleaned up", self.session_id)
