import pytest
from unittest.mock import AsyncMock
from meeting.summarizer import MeetingSummarizer, SummaryResult
from meeting.session import Utterance


class TestMeetingSummarizer:
    def test_init(self):
        refiner = AsyncMock()
        summarizer = MeetingSummarizer(refiner, interval=60)
        assert summarizer.interval == 60
        assert summarizer.running_summary == ""
        assert len(summarizer.pending_utterances) == 0

    def test_add_utterance(self):
        refiner = AsyncMock()
        summarizer = MeetingSummarizer(refiner)
        u = Utterance(
            id="1", speaker="张三", speaker_id="s1",
            text="你好", start=0.0, end=1.0, confidence=0.9
        )
        summarizer.add_utterance(u)
        assert len(summarizer.pending_utterances) == 1

    def test_should_summarize(self):
        refiner = AsyncMock()
        summarizer = MeetingSummarizer(refiner)
        assert summarizer.should_summarize() is False

        u = Utterance(
            id="1", speaker="张三", speaker_id="s1",
            text="你好", start=0.0, end=1.0, confidence=0.9
        )
        summarizer.add_utterance(u)
        assert summarizer.should_summarize() is True

    def test_format_transcript(self):
        refiner = AsyncMock()
        summarizer = MeetingSummarizer(refiner)
        utterances = [
            Utterance(id="1", speaker="张三", speaker_id="s1",
                      text="你好", start=0.0, end=1.0, confidence=0.9),
            Utterance(id="2", speaker="李四", speaker_id="s2",
                      text="你好啊", start=1.5, end=2.5, confidence=0.9),
        ]
        text = summarizer._format_transcript(utterances)
        assert "[张三] 你好" in text
        assert "[李四] 你好啊" in text

    def test_build_prompt(self):
        refiner = AsyncMock()
        summarizer = MeetingSummarizer(refiner)
        prompt = summarizer._build_prompt("之前摘要", "[张三] 新内容")
        assert "之前摘要" in prompt
        assert "新内容" in prompt
