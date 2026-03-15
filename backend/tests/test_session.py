import asyncio
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
        assert payload["text"] == "hello world"
        assert payload["start"] == 1.0


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
            def process_segment(self, audio, start_time, end_time):
                call_order.append("speaker")
                info = MagicMock()
                info.display_name = "Alice"
                info.registered_id = "spk_001"
                info.label = "Speaker_0"
                info.confidence = 0.88
                return info

            def reset(self):
                return None

        segment = MagicMock()
        segment.audio = MagicMock()
        segment.start_time = 0.0
        segment.end_time = 1.0

        session.set_asr_engine(MockAsr())
        session._speaker_tracker = MockTracker()

        utterance = asyncio.run(session.process_audio_segment(segment))

        assert call_order == ["asr", "speaker"]
        assert utterance.speaker == "Alice"
        assert utterance.text == "transcript"
