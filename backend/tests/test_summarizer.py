import asyncio
from unittest.mock import AsyncMock

from meeting.session import Utterance
from meeting.summarizer import MeetingSummarizer


class TestMeetingSummarizer:
    def test_init(self):
        refiner = AsyncMock()
        summarizer = MeetingSummarizer(refiner, interval=60)
        assert summarizer.interval == 60
        assert summarizer.max_context_summaries == 2
        assert summarizer.running_summary == ""
        assert summarizer.recent_summaries == []
        assert summarizer.decisions == []
        assert summarizer.action_items == []
        assert len(summarizer.pending_utterances) == 0

    def test_add_utterance(self):
        refiner = AsyncMock()
        summarizer = MeetingSummarizer(refiner)
        utterance = Utterance(
            id="1",
            speaker="张三",
            speaker_id="s1",
            text="你好",
            start=0.0,
            end=1.0,
            confidence=0.9,
        )
        summarizer.add_utterance(utterance)
        assert len(summarizer.pending_utterances) == 1

    def test_should_summarize(self):
        refiner = AsyncMock()
        summarizer = MeetingSummarizer(refiner)
        assert summarizer.should_summarize() is False

        utterance = Utterance(
            id="1",
            speaker="张三",
            speaker_id="s1",
            text="你好",
            start=0.0,
            end=1.0,
            confidence=0.9,
        )
        summarizer.add_utterance(utterance)
        assert summarizer.should_summarize() is True

    def test_format_transcript(self):
        refiner = AsyncMock()
        summarizer = MeetingSummarizer(refiner)
        utterances = [
            Utterance(
                id="1",
                speaker="张三",
                speaker_id="s1",
                text="你好",
                start=0.0,
                end=1.0,
                confidence=0.9,
            ),
            Utterance(
                id="2",
                speaker="李四",
                speaker_id="s2",
                text="你好啊",
                start=1.5,
                end=2.5,
                confidence=0.9,
            ),
        ]
        text = summarizer._format_transcript(utterances)
        assert "[张三] 你好" in text
        assert "[李四] 你好啊" in text

    def test_build_prompt_includes_recent_summaries_and_state(self):
        refiner = AsyncMock()
        summarizer = MeetingSummarizer(refiner)
        prompt = summarizer._build_prompt(
            "[张三] 新内容",
            ["摘要A", "摘要B"],
            ["决定1"],
            [{"assignee": "张三", "task": "跟进"}],
        )
        assert "最近摘要上下文" in prompt
        assert "摘要A" in prompt
        assert "摘要B" in prompt
        assert "当前状态" in prompt
        assert "决定1" in prompt
        assert "本轮新增内容" in prompt
        assert "[张三] 新内容" in prompt

    def test_generate_summary_uses_recent_two_summaries_and_merges_lists(self):
        refiner = AsyncMock()
        refiner._call_llm = AsyncMock(
            side_effect=[
                '{"summary":"第一轮摘要","decisions":["决定A"],"action_items":[{"assignee":"张三","task":"跟进A"}]}',
                '{"summary":"第二轮摘要","decisions":["决定B"],"action_items":[{"assignee":"李四","task":"跟进B"}]}',
                '{"summary":"第三轮摘要","decisions":[],"action_items":[]}',
            ]
        )
        summarizer = MeetingSummarizer(refiner)

        for index, speaker in enumerate(["张三", "李四", "王五"], start=1):
            summarizer.add_utterance(
                Utterance(
                    id=str(index),
                    speaker=speaker,
                    speaker_id=f"s{index}",
                    text=f"第{index}段",
                    start=float(index - 1),
                    end=float(index),
                    confidence=0.9,
                )
            )
            asyncio.run(summarizer.generate_summary())

        assert summarizer.running_summary == "第一轮摘要\n\n第二轮摘要\n\n第三轮摘要"
        assert summarizer.recent_summaries == ["第二轮摘要", "第三轮摘要"]
        assert summarizer.decisions == ["决定A", "决定B"]
        assert summarizer.action_items == [
            {"assignee": "张三", "task": "跟进A"},
            {"assignee": "李四", "task": "跟进B"},
        ]
