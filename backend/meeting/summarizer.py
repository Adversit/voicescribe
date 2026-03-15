"""Incremental meeting summarization with short-term summary context."""

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
    def __init__(
        self,
        refiner: AIRefiner,
        interval: int = 120,
        max_context_summaries: int = 2,
    ):
        self.refiner = refiner
        self.interval = interval
        self.max_context_summaries = max_context_summaries
        self.running_summary = ""
        self.recent_summaries: list[str] = []
        self.decisions: list[str] = []
        self.action_items: list[dict] = []
        self.pending_utterances: list[Utterance] = []
        self._last_summarized_index = 0

    def add_utterance(self, utterance: Utterance):
        self.pending_utterances.append(utterance)

    def should_summarize(self) -> bool:
        return len(self.pending_utterances) > 0

    async def generate_summary(self) -> Optional[SummaryResult]:
        """Summarize only the newly added utterances with short context."""
        if not self.should_summarize():
            return None

        new_transcript = self._format_transcript(self.pending_utterances)
        prompt = self._build_prompt(
            new_transcript,
            self.recent_summaries[-self.max_context_summaries :],
            self.decisions,
            self.action_items,
        )

        try:
            raw = await self.refiner._call_llm(prompt)
            chunk_result = self._parse_summary(raw)
            self._remember_chunk_summary(chunk_result.content)
            self.running_summary = self._append_summary(
                self.running_summary,
                chunk_result.content,
            )
            self.decisions = self._merge_unique_strings(
                self.decisions,
                chunk_result.decisions,
            )
            self.action_items = self._merge_action_items(
                self.action_items,
                chunk_result.action_items,
            )
            self.pending_utterances.clear()
            return SummaryResult(
                content=self.running_summary,
                decisions=list(self.decisions),
                action_items=list(self.action_items),
            )
        except Exception as exc:
            logger.error(f"[Summarizer] Failed: {exc}")
            return None

    def _format_transcript(self, utterances: list[Utterance]) -> str:
        lines = []
        for utterance in utterances:
            text = utterance.refined_text or utterance.text
            lines.append(f"[{utterance.speaker_display}] {text}")
        return "\n".join(lines)

    def _format_state(
        self,
        decisions: list[str],
        action_items: list[dict],
    ) -> str:
        state = {
            "decisions": decisions,
            "action_items": action_items,
        }
        return json.dumps(state, ensure_ascii=False)

    def _build_prompt(
        self,
        new_transcript: str,
        recent_summaries: list[str],
        decisions: list[str],
        action_items: list[dict],
    ) -> str:
        if recent_summaries:
            context_text = "\n\n".join(
                f"第{index + 1}条最近摘要：{summary}"
                for index, summary in enumerate(recent_summaries)
            )
        else:
            context_text = "无"

        state_text = self._format_state(decisions, action_items)

        return (
            "你是一个会议记录助手。\n"
            "请只根据本轮新增内容进行总结，但可以参考最近两轮摘要和当前决策/待办状态保持上下文连续。\n"
            "不要重写整场会议，不要把旧内容重新展开。\n\n"
            f"最近摘要上下文：\n{context_text}\n\n"
            f"当前状态：\n{state_text}\n\n"
            f"本轮新增内容：\n{new_transcript}\n\n"
            "请输出 JSON：\n"
            '{"summary": "本轮新增摘要（1-3句）", '
            '"decisions": ["新增或更新后的决策"], '
            '"action_items": [{"assignee": "姓名", "task": "任务"}]}\n\n'
            "如果没有新增决策或待办，对应数组返回空数组。只输出 JSON。"
        )

    def _remember_chunk_summary(self, chunk_summary: str):
        normalized = chunk_summary.strip()
        if not normalized:
            return
        self.recent_summaries.append(normalized)
        if len(self.recent_summaries) > self.max_context_summaries:
            self.recent_summaries = self.recent_summaries[-self.max_context_summaries :]

    def _append_summary(self, running_summary: str, chunk_summary: str) -> str:
        normalized = chunk_summary.strip()
        if not normalized:
            return running_summary
        if not running_summary:
            return normalized
        return f"{running_summary}\n\n{normalized}"

    def _merge_unique_strings(
        self,
        existing: list[str],
        new_items: list[str],
    ) -> list[str]:
        merged = list(existing)
        seen = {item.strip() for item in existing if item.strip()}
        for item in new_items:
            normalized = item.strip()
            if normalized and normalized not in seen:
                merged.append(normalized)
                seen.add(normalized)
        return merged

    def _merge_action_items(
        self,
        existing: list[dict],
        new_items: list[dict],
    ) -> list[dict]:
        merged = list(existing)
        seen = {
            (
                str(item.get("assignee", "")).strip(),
                str(item.get("task", "")).strip(),
            )
            for item in existing
        }
        for item in new_items:
            assignee = str(item.get("assignee", "")).strip()
            task = str(item.get("task", "")).strip()
            if not assignee and not task:
                continue
            key = (assignee, task)
            if key in seen:
                continue
            merged.append({"assignee": assignee, "task": task})
            seen.add(key)
        return merged

    def _parse_summary(self, raw: str) -> SummaryResult:
        try:
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

        return SummaryResult(content=raw.strip())

    def reset(self):
        self.running_summary = ""
        self.recent_summaries.clear()
        self.decisions.clear()
        self.action_items.clear()
        self.pending_utterances.clear()
        self._last_summarized_index = 0
