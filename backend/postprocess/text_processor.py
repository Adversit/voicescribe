"""
Text processing utilities for non-dictation workflows:
- edit_selected: rewrite/summarize/polish/custom
- ask_selected: answer question from selected context
"""

from __future__ import annotations

import re
import shutil
import subprocess
from typing import Optional, Tuple


class TextProcessor:
    """Best-effort text processor with optional Claude CLI and local fallback."""

    def __init__(self):
        self.claude_bin = shutil.which("claude")

    def _run_claude(self, prompt: str, timeout: int = 45) -> Optional[str]:
        if not self.claude_bin:
            return None
        try:
            result = subprocess.run(
                [self.claude_bin, "--model", "haiku", "--print", prompt],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=timeout,
            )
            output = (result.stdout or "").strip()
            if result.returncode == 0 and output:
                return output
            stderr = (result.stderr or "").strip()
            if stderr:
                print(f"[TextProcessor] Claude failed rc={result.returncode}: {stderr[:200]}")
            elif output:
                print(f"[TextProcessor] Claude failed rc={result.returncode}: {output[:200]}")
        except subprocess.TimeoutExpired:
            print(f"[TextProcessor] Claude timed out after {timeout}s")
            return None
        except Exception as e:
            print(f"[TextProcessor] Claude invoke error: {e}")
            return None
        return None

    def _normalize_spaces(self, text: str) -> str:
        text = text.replace("\r\n", "\n").replace("\r", "\n")
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()

    def _split_sentences(self, text: str) -> list[str]:
        text = self._normalize_spaces(text)
        if not text:
            return []
        parts = re.split(r"(?<=[。！？.!?])\s+|\n+", text)
        return [p.strip() for p in parts if p and p.strip()]

    def _summarize_fallback(self, selected_text: str) -> str:
        sentences = self._split_sentences(selected_text)
        if not sentences:
            return ""
        if len(sentences) <= 2:
            return " ".join(sentences)
        return " ".join(sentences[:2])

    def _polish_fallback(self, selected_text: str) -> str:
        text = self._normalize_spaces(selected_text)
        # Light punctuation cleanup for Chinese/English mixed text.
        text = re.sub(r"\s+([,.!?;:，。！？；：])", r"\1", text)
        text = re.sub(r"([，。！？；：])([^\s])", r"\1 \2", text)
        text = re.sub(r"\s{2,}", " ", text)
        return text.strip()

    def _rewrite_fallback(self, selected_text: str, instruction: str = "") -> str:
        delete_result = self._delete_phrase_fallback(selected_text, instruction)
        if delete_result is not None:
            return delete_result

        instruction_l = (instruction or "").lower()
        if any(k in instruction_l for k in ["summarize", "summary", "shorter"]):
            return self._summarize_fallback(selected_text)
        if any(k in instruction_l for k in ["polish", "formal", "improve"]):
            return self._polish_fallback(selected_text)
        if any(k in instruction for k in ["总结", "摘要", "精简", "更短"]):
            return self._summarize_fallback(selected_text)
        if any(k in instruction for k in ["润色", "正式", "优化", "通顺"]):
            return self._polish_fallback(selected_text)
        # Default rewrite fallback: keep original meaning with light cleanup.
        return self._polish_fallback(selected_text)

    def _delete_phrase_fallback(self, selected_text: str, instruction: str) -> Optional[str]:
        instruction = (instruction or "").strip()
        if not instruction:
            return None
        if not any(k in instruction for k in ["删除", "删掉", "去掉", "移除"]):
            return None

        terms: list[str] = []

        # 1) Prefer explicit quoted terms.
        quoted = re.findall(r"[\"'“”‘’《》](.+?)[\"'“”‘’《》]", instruction)
        terms.extend([q.strip() for q in quoted if q and q.strip()])

        # 2) Common imperative patterns.
        patterns = [
            r"(?:删除|删掉|去掉|移除)\s*(?:这|这个|这段|这句)?\s*([^\s，。！？；：,.!?\"'“”‘’《》]{1,32})",
            r"把\s*([^\s，。！？；：,.!?\"'“”‘’《》]{1,32})\s*(?:删掉|删除|去掉|移除)",
        ]
        for pat in patterns:
            m = re.search(pat, instruction)
            if m:
                terms.append(m.group(1).strip())

        if not terms:
            return None

        result = selected_text
        changed = False
        for term in terms:
            t = term.strip().strip("\"'“”‘’《》")
            # Trim trailing quantity markers in commands like "删除结论两个字".
            t = re.sub(r"(这)?(一|二|两|三|四|五)?个?(字|词)$", "", t)
            t = t.strip()
            if not t:
                continue
            if t in result:
                result = result.replace(t, "", 1)
                changed = True
                break

        if not changed:
            return None

        result = re.sub(r"\s{2,}", " ", result)
        result = re.sub(r"\s+([,.!?;:，。！？；：])", r"\1", result)
        result = re.sub(r"([（(])\s+", r"\1", result)
        result = re.sub(r"\s+([）)])", r"\1", result)
        return result.strip()

    def edit_selected(
        self,
        selected_text: str,
        instruction: str = "",
        command: str = "rewrite",
        custom_prompt: str = "",
        language: str = "zh",
    ) -> Tuple[str, str]:
        """Return (result_text, provider)."""
        selected_text = (selected_text or "").strip()
        instruction = (instruction or "").strip()
        command = (command or "rewrite").strip().lower()
        custom_prompt = (custom_prompt or "").strip()

        if not selected_text:
            return "", "fallback"

        if self.claude_bin:
            if command == "custom" and custom_prompt:
                prompt = (
                    "You are a text editor assistant.\n"
                    "Apply the custom instruction to the selected text.\n"
                    "Return only final edited text.\n\n"
                    f"Language hint: {language}\n"
                    f"Selected text:\n{selected_text}\n\n"
                    f"Voice instruction:\n{instruction or '(none)'}\n\n"
                    f"Custom prompt:\n{custom_prompt}\n"
                )
            else:
                task = {
                    "rewrite": "Rewrite the text while preserving meaning.",
                    "summarize": "Summarize the text concisely.",
                    "polish": "Polish the text for clarity and fluency.",
                }.get(command, "Rewrite the text while preserving meaning.")
                prompt = (
                    "You are a text editor assistant.\n"
                    f"{task}\n"
                    "Return only final edited text.\n\n"
                    f"Language hint: {language}\n"
                    f"Selected text:\n{selected_text}\n\n"
                    f"Voice instruction:\n{instruction or '(none)'}\n"
                )

            out = self._run_claude(prompt, timeout=120)
            if out:
                return out, "claude"

        if command == "summarize":
            return self._summarize_fallback(selected_text), "fallback"
        if command == "polish":
            return self._polish_fallback(selected_text), "fallback"
        if command == "custom":
            # Without external model, fallback to safe rewrite.
            return self._rewrite_fallback(selected_text, instruction), "fallback"
        return self._rewrite_fallback(selected_text, instruction), "fallback"

    def ask_selected(
        self,
        selected_text: str,
        question: str,
        language: str = "zh",
    ) -> Tuple[str, str]:
        """Return (answer_text, provider)."""
        selected_text = (selected_text or "").strip()
        question = (question or "").strip()

        if not selected_text:
            return "", "fallback"
        if not question:
            return self._summarize_fallback(selected_text), "fallback"

        if self.claude_bin:
            prompt = (
                "You are a Q&A assistant.\n"
                "Answer based on the provided selected text.\n"
                "If context is insufficient, say so explicitly.\n"
                "Keep answer concise.\n\n"
                f"Language hint: {language}\n"
                f"Selected text:\n{selected_text}\n\n"
                f"Question:\n{question}\n"
            )
            out = self._run_claude(prompt, timeout=120)
            if out:
                return out, "claude"

        summary = self._summarize_fallback(selected_text)
        if any(k in question.lower() for k in ["summary", "summarize"]) or any(
            k in question for k in ["总结", "概括", "摘要"]
        ):
            return summary, "fallback"

        answer = (
            "当前为本地回退问答模式，未调用外部模型。"
            f"基于选中文本可得的要点：{summary}"
        )
        return answer, "fallback"
