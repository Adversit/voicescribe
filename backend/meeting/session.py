"""Meeting session orchestrator.

Manages the lifecycle of a meeting recording session:
VAD segmentation -> ASR transcription -> speaker clustering -> speaker mapping.
"""

import logging
import time
import uuid
from dataclasses import dataclass
from typing import Optional

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
    refined_text: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "type": "utterance",
            "id": self.id,
            "speaker": self.speaker,
            "speaker_id": self.speaker_id,
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

    async def process_audio_segment(self, segment) -> Utterance:
        """Process one VAD segment through ASR and the streaming speaker pipeline."""
        if self.asr_engine is None:
            raise RuntimeError("ASR engine not set")

        result = self.asr_engine.transcribe_array(
            segment.audio,
            sample_rate=16000,
            hotwords=self.config.hotwords,
        )

        if self.speaker_tracker:
            speaker_info = self.speaker_tracker.process_segment(
                segment.audio, segment.start_time, segment.end_time
            )
            speaker_name = speaker_info.display_name
            speaker_id = speaker_info.registered_id or speaker_info.label
            confidence = speaker_info.confidence
        else:
            speaker_name = "Speaker"
            speaker_id = "unknown"
            confidence = 0.0

        self._utterance_counter += 1
        utterance = Utterance(
            id=f"utt_{self._utterance_counter:04d}",
            speaker=speaker_name,
            speaker_id=speaker_id,
            text=result["text"],
            start=segment.start_time,
            end=segment.end_time,
            confidence=confidence,
        )

        self.add_utterance(utterance)
        return utterance

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
                lines.append(f"[{utterance.speaker}] {text}")
            else:
                lines.append(text)

        result = "\n".join(lines)

        if include_summary and self.running_summary:
            result += f"\n\n---\n{self.running_summary}"

        return result

    def get_recent_transcript(self, since_utterance: int = 0) -> str:
        """Get transcript since a given utterance index, for summarization."""
        recent = self.utterances[since_utterance:]
        return "\n".join(f"[{item.speaker}] {item.refined_text or item.text}" for item in recent)

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
