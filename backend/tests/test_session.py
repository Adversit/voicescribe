import asyncio
import numpy as np
from unittest.mock import MagicMock

from meeting.session import MeetingSession, SessionConfig, Utterance


class TestSessionConfig:
    def test_defaults(self):
        cfg = SessionConfig()
        assert cfg.engine == "firered"
        assert cfg.speakers_enabled is True
        assert cfg.summary_interval == 120

    def test_custom(self):
        cfg = SessionConfig(engine="funasr", summary_interval=60)
        assert cfg.engine == "funasr"
        assert cfg.summary_interval == 60


class TestUtterance:
    def test_to_dict(self):
        utterance = Utterance(
            id="utt_001",
            speaker="Alice",
            speaker_id="spk_001",
            text="hello world",
            start=1.0,
            end=3.5,
            confidence=0.85,
        )
        payload = utterance.to_dict()
        assert payload["type"] == "utterance"
        assert payload["speaker"] == "Alice"
        assert payload["speakers"] == []
        assert payload["overlap_detected"] is False
        assert payload["overlap_score"] == 0.0
        assert payload["speaker_spans"] == []
        assert payload["text"] == "hello world"
        assert payload["start"] == 1.0

    def test_speaker_display_joins_multiple_labels(self):
        utterance = Utterance(
            id="utt_001",
            speaker="Alice",
            speaker_id="spk_001",
            text="hello world",
            start=1.0,
            end=3.5,
            confidence=0.85,
            speakers=[
                {
                    "speaker": "Alice",
                    "speaker_id": "spk_001",
                    "confidence": 0.85,
                    "role": "primary",
                },
                {
                    "speaker": "Bob",
                    "speaker_id": "spk_002",
                    "confidence": 0.81,
                    "role": "secondary",
                },
            ],
        )
        assert utterance.speaker_display == "Alice / Bob"


class TestMeetingSession:
    def test_init(self):
        session = MeetingSession(SessionConfig(speakers_enabled=False))
        assert session.session_id is not None
        assert len(session.utterances) == 0
        assert session.running_summary == ""

    def test_add_utterance(self):
        session = MeetingSession(SessionConfig(speakers_enabled=False))
        utterance = Utterance(
            id="utt_001",
            speaker="Alice",
            speaker_id="spk_001",
            text="hello",
            start=0.0,
            end=1.0,
            confidence=0.9,
        )
        session.add_utterance(utterance)
        assert len(session.utterances) == 1
        assert session.utterances[0].text == "hello"

    def test_get_plain_text(self):
        session = MeetingSession(SessionConfig(speakers_enabled=False))
        session.add_utterance(
            Utterance(
                id="1",
                speaker="Alice",
                speaker_id="s1",
                text="hello",
                start=0.0,
                end=1.0,
                confidence=0.9,
            )
        )
        session.add_utterance(
            Utterance(
                id="2",
                speaker="Bob",
                speaker_id="s2",
                text="world",
                start=1.5,
                end=2.5,
                confidence=0.9,
            )
        )
        assert session.get_plain_text() == "hello\nworld"

    def test_get_formatted_text_with_speakers(self):
        session = MeetingSession(SessionConfig(speakers_enabled=False))
        session.add_utterance(
            Utterance(
                id="1",
                speaker="Alice",
                speaker_id="s1",
                text="hello",
                start=0.0,
                end=1.0,
                confidence=0.9,
            )
        )
        text = session.get_formatted_text(include_speakers=True)
        assert "[Alice]" in text

    def test_process_audio_segment_runs_asr_before_speaker_pipeline(self):
        session = MeetingSession(SessionConfig())
        call_order: list[str] = []

        class MockAsr:
            def transcribe_array(self, audio, sample_rate=16000, **kwargs):
                call_order.append("asr")
                return {"text": "transcript"}

        class MockTracker:
            def process_segment(self, audio, start_time, end_time, transcript_text=None):
                call_order.append("speaker")
                assert transcript_text == "transcript"
                info = MagicMock()
                info.display_name = "Alice"
                info.registered_id = "spk_001"
                info.speaker_id = "spk_001"
                info.label = "Speaker_0"
                info.confidence = 0.88
                info.overlap_detected = True
                info.overlap_score = 0.72
                info.get_speaker_labels.return_value = [
                    {
                        "speaker": "Alice",
                        "speaker_id": "spk_001",
                        "confidence": 0.88,
                        "role": "primary",
                    }
                ]
                info.get_speaker_spans.return_value = [
                    {
                        "start": 0.0,
                        "end": 0.5,
                        "speaker": "Alice",
                        "speaker_id": "spk_001",
                        "confidence": 0.88,
                        "speakers": info.get_speaker_labels.return_value,
                        "overlap_detected": True,
                        "overlap_score": 0.72,
                    }
                ]
                return info

            def reset(self):
                return None

        segment = MagicMock()
        segment.audio = MagicMock()
        segment.start_time = 0.0
        segment.end_time = 1.0

        session.set_asr_engine(MockAsr())
        session._speaker_tracker = MockTracker()

        utterances = asyncio.run(session.process_audio_segment(segment))

        assert call_order == ["asr", "speaker"]
        assert len(utterances) == 1
        utterance = utterances[0]
        assert utterance.speaker == "Alice"
        assert utterance.speakers[0]["speaker"] == "Alice"
        assert utterance.overlap_detected is True
        assert utterance.overlap_score == 0.72
        assert utterance.speaker_spans[0]["speaker"] == "Alice"
        assert utterance.text == "transcript"

    def test_process_audio_segment_splits_non_overlapping_speaker_spans(self):
        session = MeetingSession(SessionConfig())
        transcribed_lengths: list[float] = []

        class MockAsr:
            def transcribe_array(self, audio, sample_rate=16000, **kwargs):
                duration = len(audio) / sample_rate
                transcribed_lengths.append(round(duration, 2))
                return {"text": f"text {duration:.1f}s"}

        class MockTracker:
            def process_segment(self, audio, start_time, end_time, transcript_text=None):
                info = MagicMock()
                info.display_name = "Alice"
                info.registered_id = "spk_001"
                info.speaker_id = "spk_001"
                info.label = "Speaker_0"
                info.confidence = 0.88
                info.overlap_detected = False
                info.overlap_score = 0.0
                info.get_speaker_labels.return_value = [
                    {
                        "speaker": "Alice",
                        "speaker_id": "spk_001",
                        "confidence": 0.88,
                        "role": "primary",
                    }
                ]
                info.get_speaker_spans.return_value = [
                    {
                        "start": 0.0,
                        "end": 1.0,
                        "speaker": "Alice",
                        "speaker_id": "spk_001",
                        "confidence": 0.88,
                        "speakers": [
                            {
                                "speaker": "Alice",
                                "speaker_id": "spk_001",
                                "confidence": 0.88,
                                "role": "primary",
                            }
                        ],
                        "overlap_detected": False,
                        "overlap_score": 0.0,
                    },
                    {
                        "start": 1.0,
                        "end": 2.0,
                        "speaker": "Bob",
                        "speaker_id": "spk_002",
                        "confidence": 0.83,
                        "speakers": [
                            {
                                "speaker": "Bob",
                                "speaker_id": "spk_002",
                                "confidence": 0.83,
                                "role": "primary",
                            }
                        ],
                        "overlap_detected": False,
                        "overlap_score": 0.0,
                    },
                ]
                return info

            def reset(self):
                return None

        segment = MagicMock()
        segment.audio = np.ones(16000 * 2, dtype=np.float32)
        segment.start_time = 0.0
        segment.end_time = 2.0

        session.set_asr_engine(MockAsr())
        session._speaker_tracker = MockTracker()

        utterances = asyncio.run(session.process_audio_segment(segment))

        assert len(utterances) == 2
        assert [item.speaker for item in utterances] == ["Alice", "Bob"]
        assert len(session.utterances) == 2
        assert transcribed_lengths == [2.0, 1.0, 1.0]

    def test_process_audio_segment_drops_short_anonymous_noise(self):
        session = MeetingSession(SessionConfig())

        class MockAsr:
            def transcribe_array(self, audio, sample_rate=16000, **kwargs):
                return {"text": "嗯"}

        class MockTracker:
            def process_segment(self, audio, start_time, end_time, transcript_text=None):
                info = MagicMock()
                info.display_name = "Speaker 2"
                info.registered_id = None
                info.speaker_id = "Speaker_1"
                info.label = "Speaker_1"
                info.confidence = 0.22
                info.overlap_detected = False
                info.overlap_score = 0.0
                info.get_speaker_labels.return_value = [
                    {
                        "speaker": "Speaker 2",
                        "speaker_id": "Speaker_1",
                        "confidence": 0.22,
                        "role": "primary",
                    }
                ]
                info.get_speaker_spans.return_value = [
                    {
                        "start": 0.0,
                        "end": 0.8,
                        "speaker": "Speaker 2",
                        "speaker_id": "Speaker_1",
                        "confidence": 0.22,
                        "speakers": info.get_speaker_labels.return_value,
                        "overlap_detected": False,
                        "overlap_score": 0.0,
                    }
                ]
                return info

            def reset(self):
                return None

        segment = MagicMock()
        segment.audio = np.ones(int(16000 * 0.8), dtype=np.float32)
        segment.start_time = 0.0
        segment.end_time = 0.8

        session.set_asr_engine(MockAsr())
        session._speaker_tracker = MockTracker()

        utterances = asyncio.run(session.process_audio_segment(segment))

        assert utterances == []
        assert session.utterances == []
