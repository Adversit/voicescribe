"""Silero VAD wrapper for speech segmentation."""

from dataclasses import dataclass
from typing import Optional

import numpy as np


@dataclass
class VADConfig:
    threshold: float = 0.5
    min_speech_ms: int = 300
    hangover_ms: int = 700
    pre_roll_ms: int = 200
    max_segment_s: float = 30.0
    sample_rate: int = 16000


@dataclass
class SpeechSegment:
    audio: np.ndarray
    start_time: float
    end_time: float


class SileroVADSegmenter:
    """Segments audio stream into speech utterances using Silero VAD."""

    def __init__(self, config: VADConfig):
        self.config = config
        self.is_speaking = False
        self._speech_buffer: list[np.ndarray] = []
        self._pre_roll_buffer: list[np.ndarray] = []
        self._speech_start_time: float = 0.0
        self._silence_duration_ms: float = 0.0
        self._total_samples: int = 0
        self._chunk_duration_ms = 512 / config.sample_rate * 1000
        self._model = None

    def _ensure_model(self):
        """Lazy-load Silero VAD model (requires torch)."""
        if self._model is not None:
            return
        import torch

        self._model, _ = torch.hub.load(
            repo_or_dir="snakers4/silero-vad",
            model="silero_vad",
            trust_repo=True,
        )

    def process_chunk(self, chunk: np.ndarray) -> Optional[SpeechSegment]:
        """Process a 512-sample audio chunk. Returns a segment when speech ends."""
        import torch

        self._ensure_model()
        current_time = self._total_samples / self.config.sample_rate
        self._total_samples += len(chunk)

        tensor = torch.from_numpy(chunk).float()
        prob = self._model(tensor, self.config.sample_rate).item()

        if prob >= self.config.threshold:
            self._silence_duration_ms = 0.0

            if not self.is_speaking:
                self.is_speaking = True
                self._speech_start_time = max(
                    0.0,
                    current_time - self.config.pre_roll_ms / 1000,
                )
                self._speech_buffer = list(self._pre_roll_buffer)
                self._pre_roll_buffer.clear()

            self._speech_buffer.append(chunk)

            speech_duration = current_time - self._speech_start_time
            if speech_duration >= self.config.max_segment_s:
                return self._finalize_segment(current_time)
        else:
            if self.is_speaking:
                self._speech_buffer.append(chunk)
                self._silence_duration_ms += self._chunk_duration_ms

                if self._silence_duration_ms >= self.config.hangover_ms:
                    speech_duration_ms = (
                        current_time - self._speech_start_time
                    ) * 1000
                    if speech_duration_ms >= self.config.min_speech_ms:
                        return self._finalize_segment(current_time)
                    self._reset_speech_state()
            else:
                self._pre_roll_buffer.append(chunk)
                max_pre_roll_chunks = int(
                    self.config.pre_roll_ms / self._chunk_duration_ms
                ) + 1
                if len(self._pre_roll_buffer) > max_pre_roll_chunks:
                    self._pre_roll_buffer.pop(0)

        return None

    def _finalize_segment(self, end_time: float) -> SpeechSegment:
        audio = np.concatenate(self._speech_buffer)
        segment = SpeechSegment(
            audio=audio,
            start_time=self._speech_start_time,
            end_time=end_time,
        )
        self._reset_speech_state()
        return segment

    def _reset_speech_state(self):
        self.is_speaking = False
        self._speech_buffer.clear()
        self._silence_duration_ms = 0.0

    def flush(self) -> Optional[SpeechSegment]:
        """Force finalize current speech segment when stream ends."""
        if not self.is_speaking or not self._speech_buffer:
            return None

        end_time = self._total_samples / self.config.sample_rate
        speech_duration_ms = (end_time - self._speech_start_time) * 1000
        if speech_duration_ms < self.config.min_speech_ms:
            self._reset_speech_state()
            return None

        return self._finalize_segment(end_time)

    def reset(self):
        """Reset all state for a new session."""
        self._reset_speech_state()
        self._pre_roll_buffer.clear()
        self._total_samples = 0
        self._speech_start_time = 0.0
        if self._model is not None:
            self._model.reset_states()
