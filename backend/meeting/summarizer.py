"""Incremental meeting summarization using rolling window + LLM.

Accumulates utterances and periodically generates updated summaries
by feeding running_summary + new_transcript to an LLM.
"""

import json
import logging
from dataclasses import dataclass, field
from typing import Optional

from meeting.session import Utterance
from postprocess.ai_refiner import AIRefiner

logger = logging.getLogger(__name__)


@dataclass
class SummaryResult:
    content: str
    decisions: list[str] = field(default_factory=list)
    action_items: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "type": "summary",
            "content": self.content,
            "decisions": self.decisions,
            "action_items": self.action_items,
        }


class MeetingSummarizer:
    def __init__(self, refiner: AIRefiner, interval: int = 120):
        self.refiner = refiner
        self.interval = interval
        self.running_summary = ""
        self.pending_utterances: list[Utterance] = []
        self._last_summarized_index = 0

    def add_utterance(self, utterance: Utterance):
        self.pending_utterances.append(utterance)

    def should_summarize(self) -> bool:
        return len(self.pending_utterances) > 0

    async def generate_summary(self) -> Optional[SummaryResult]:
        """Generate an incremental summary from pending utterances."""
        if not self.should_summarize():
            return None

        new_transcript = self._format_transcript(self.pending_utterances)
        prompt = self._build_prompt(self.running_summary, new_transcript)

        try:
            raw = await self.refiner._call_llm(prompt)
            result = self._parse_summary(raw)
            self.running_summary = result.content
            self.pending_utterances.clear()
            return result
        except Exception as e:
            logger.error(f"[Summarizer] Failed: {e}")
            return None

    def _format_transcript(self, utterances: list[Utterance]) -> str:
        lines = []
        for u in utterances:
            text = u.refined_text or u.text
            lines.append(f"[{u.speaker}] {text}")
        return "\n".join(lines)

    def _build_prompt(self, running_summary: str, new_transcript: str) -> str:
        return (
            f"你是一个会议记录助手。基于之前的摘要和新的讨论内容，更新摘要。\n\n"
            f"之前的摘要：{running_summary or '（无）'}\n\n"
            f"新内容：\n{new_transcript}\n\n"
            f"请输出JSON格式：\n"
            f'{{"summary": "更新后的摘要（3-5句话）", '
            f'"decisions": ["决策1", ...], '
            f'"action_items": [{{"assignee": "姓名", "task": "任务"}}]}}\n\n'
            f"如果没有明确的决策或待办，对应数组留空。只输出JSON，不要其他内容。"
        )

    def _parse_summary(self, raw: str) -> SummaryResult:
        """Parse LLM output into SummaryResult."""
        # Try JSON parsing first
        try:
            # Find JSON in the response
            start = raw.find("{")
            end = raw.rfind("}") + 1
            if start >= 0 and end > start:
                data = json.loads(raw[start:end])
                return SummaryResult(
                    content=data.get("summary", raw),
                    decisions=data.get("decisions", []),
                    action_items=data.get("action_items", []),
                )
        except (json.JSONDecodeError, KeyError):
            pass

        # Fallback: use raw text as summary
        return SummaryResult(content=raw.strip())

    def reset(self):
        self.running_summary = ""
        self.pending_utterances.clear()
        self._last_summarized_index = 0
