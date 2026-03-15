"""Integration test: MeetingSession with mock ASR."""

import asyncio

import numpy as np

from meeting.session import MeetingSession, SessionConfig
from meeting.vad import SpeechSegment


class MockASREngine:
    def transcribe_array(self, audio, sample_rate=16000, **kwargs):
        duration = len(audio) / sample_rate
        return {
            "text": f"transcribed {duration:.1f}s",
            "segments": [],
            "duration": 0.01,
            "language": "zh",
            "engine": "mock",
        }


class TestMeetingIntegration:
    def test_full_pipeline_mock(self):
        session = MeetingSession(SessionConfig(speakers_enabled=False))
        session.set_asr_engine(MockASREngine())

        audio = np.random.randn(16000 * 3).astype(np.float32)
        segment = SpeechSegment(audio=audio, start_time=0.0, end_time=3.0)

        utterance = asyncio.run(session.process_audio_segment(segment))

        assert utterance.text.startswith("transcribed")
        assert utterance.speaker == "Speaker"
        assert len(session.utterances) == 1

    def test_session_data_output(self):
        session = MeetingSession(SessionConfig(speakers_enabled=False))
        session.set_asr_engine(MockASREngine())

        audio = np.random.randn(16000 * 2).astype(np.float32)
        segment = SpeechSegment(audio=audio, start_time=0.0, end_time=2.0)

        asyncio.run(session.process_audio_segment(segment))

        data = session.get_session_data()
        assert data["session_id"] == session.session_id
        assert len(data["utterances"]) == 1
        assert len(data["plain_text"]) > 0

    def test_formatted_output(self):
        session = MeetingSession(SessionConfig(speakers_enabled=False))
        session.set_asr_engine(MockASREngine())

        audio = np.random.randn(16000).astype(np.float32)
        segment = SpeechSegment(audio=audio, start_time=0.0, end_time=1.0)

        asyncio.run(session.process_audio_segment(segment))

        plain = session.get_plain_text()
        assert "transcribed" in plain

        with_speakers = session.get_formatted_text(include_speakers=True)
        assert "[Speaker]" in with_speakers
