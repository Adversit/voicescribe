import pytest
from unittest.mock import MagicMock
from meeting.session import MeetingSession, Utterance, SessionConfig


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
        u = Utterance(
            id="utt_001",
            speaker="张三",
            speaker_id="spk_001",
            text="测试文本",
            start=1.0,
            end=3.5,
            confidence=0.85,
        )
        d = u.to_dict()
        assert d["type"] == "utterance"
        assert d["speaker"] == "张三"
        assert d["text"] == "测试文本"
        assert d["start"] == 1.0


class TestMeetingSession:
    def test_init(self):
        session = MeetingSession(SessionConfig(speakers_enabled=False))
        assert session.session_id is not None
        assert len(session.utterances) == 0
        assert session.running_summary == ""

    def test_add_utterance(self):
        session = MeetingSession(SessionConfig(speakers_enabled=False))
        u = Utterance(
            id="utt_001",
            speaker="张三",
            speaker_id="spk_001",
            text="你好",
            start=0.0,
            end=1.0,
            confidence=0.9,
        )
        session.add_utterance(u)
        assert len(session.utterances) == 1
        assert session.utterances[0].text == "你好"

    def test_get_plain_text(self):
        session = MeetingSession(SessionConfig(speakers_enabled=False))
        session.add_utterance(Utterance(
            id="1", speaker="张三", speaker_id="s1",
            text="你好", start=0.0, end=1.0, confidence=0.9
        ))
        session.add_utterance(Utterance(
            id="2", speaker="李四", speaker_id="s2",
            text="你好啊", start=1.5, end=2.5, confidence=0.9
        ))
        assert session.get_plain_text() == "你好\n你好啊"

    def test_get_formatted_text_with_speakers(self):
        session = MeetingSession(SessionConfig(speakers_enabled=False))
        session.add_utterance(Utterance(
            id="1", speaker="张三", speaker_id="s1",
            text="你好", start=0.0, end=1.0, confidence=0.9
        ))
        text = session.get_formatted_text(include_speakers=True)
        assert "[张三]" in text
