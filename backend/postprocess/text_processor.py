"""
LLM-first text processing for non-dictation workflows.
- edit_selected: rewrite/summarize/polish/custom
- ask_selected: answer question from selected context

Primary provider: Claude CLI (haiku, headless).
Optional fallback provider: DeepSeek API (OpenAI-compatible endpoint).
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
import urllib.error
import urllib.request
from typing import Optional, Tuple


class TextProcessor:
    """LLM-first text processor. Avoids rule-based rewriting."""

    def __init__(self):
        self.claude_bin = shutil.which("claude")
        self.model_timeout = self._read_int_env("VOICESCRIBE_TEXT_MODEL_TIMEOUT", 120)
        self.model_retries = max(1, self._read_int_env("VOICESCRIBE_TEXT_MODEL_RETRIES", 2))

        # DeepSeek fallback (optional)
        self.enable_deepseek_fallback = os.getenv("VOICESCRIBE_ENABLE_DEEPSEEK_FALLBACK", "1") != "0"
        self.deepseek_api_key = (os.getenv("DEEPSEEK_API_KEY") or "").strip()
        self.deepseek_base_url = (os.getenv("DEEPSEEK_BASE_URL") or "https://api.deepseek.com").strip().rstrip("/")
        self.deepseek_model = (os.getenv("DEEPSEEK_MODEL") or "deepseek-chat").strip()

    @staticmethod
    def _read_int_env(name: str, default: int) -> int:
        raw = os.getenv(name, "").strip()
        if not raw:
            return default
        try:
            value = int(raw)
            return value if value > 0 else default
        except Exception:
            return default

    def _run_claude(self, prompt: str) -> Optional[str]:
        if not self.claude_bin:
            return None

        for attempt in range(1, self.model_retries + 1):
            try:
                result = subprocess.run(
                    [self.claude_bin, "--model", "haiku", "--print", prompt],
                    capture_output=True,
                    timeout=self.model_timeout,
                )
                stdout_bytes = result.stdout or b""
                stderr_bytes = result.stderr or b""
                output = stdout_bytes.decode("utf-8", errors="replace").strip()
                if result.returncode == 0 and output:
                    return output

                stderr = stderr_bytes.decode("utf-8", errors="replace").strip()
                if stderr:
                    print(
                        f"[TextProcessor] Claude failed attempt={attempt}/{self.model_retries} "
                        f"rc={result.returncode}: {stderr[:300]}"
                    )
                else:
                    print(
                        f"[TextProcessor] Claude empty output attempt={attempt}/{self.model_retries} "
                        f"rc={result.returncode}"
                    )
            except subprocess.TimeoutExpired:
                print(
                    f"[TextProcessor] Claude timeout attempt={attempt}/{self.model_retries} "
                    f"after {self.model_timeout}s"
                )
            except Exception as e:
                print(f"[TextProcessor] Claude invoke error attempt={attempt}/{self.model_retries}: {e}")

            if attempt < self.model_retries:
                time.sleep(min(2 * attempt, 4))

        return None

    def _post_json(self, url: str, payload: dict, headers: dict, timeout: int) -> Optional[dict]:
        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
                if not raw:
                    return None
                return json.loads(raw)
        except urllib.error.HTTPError as e:
            err_body = ""
            try:
                err_body = e.read().decode("utf-8", errors="replace")
            except Exception:
                pass
            print(f"[TextProcessor] HTTPError {e.code} on {url}: {err_body[:300]}")
            return None
        except Exception as e:
            print(f"[TextProcessor] request error on {url}: {e}")
            return None

    def _run_deepseek(self, system_prompt: str, user_prompt: str) -> Optional[str]:
        if not self.deepseek_api_key:
            return None

        payload = {
            "model": self.deepseek_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.2,
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.deepseek_api_key}",
        }
        url = f"{self.deepseek_base_url}/chat/completions"
        data = self._post_json(url, payload, headers, timeout=self.model_timeout)
        if not data:
            return None

        try:
            choices = data.get("choices") or []
            if not choices:
                return None
            message = choices[0].get("message") or {}
            content = (message.get("content") or "").strip()
            return content or None
        except Exception:
            return None

    def _call_llm(self, system_prompt: str, user_prompt: str) -> Tuple[Optional[str], str]:
        # Priority 1: Claude CLI (headless haiku)
        claude_prompt = f"{system_prompt}\n\n{user_prompt}"
        out = self._run_claude(claude_prompt)
        if out:
            return out, "claude"

        # Priority 2: optional DeepSeek fallback
        if self.enable_deepseek_fallback and self.deepseek_api_key:
            out = self._run_deepseek(system_prompt, user_prompt)
            if out:
                return out, "deepseek"

        return None, "unavailable"

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
            return "", "fallback_empty_input"

        if command == "custom" and custom_prompt:
            task = "Apply the custom prompt to edit the selected text."
        else:
            task = {
                "rewrite": "Rewrite the text while preserving meaning.",
                "summarize": "Summarize the text concisely.",
                "polish": "Polish the text for clarity and fluency.",
            }.get(command, "Rewrite the text while preserving meaning.")

        system_prompt = (
            "You are a text editor assistant. "
            "Follow the task and voice instruction exactly. "
            "Return only the final edited text without explanation."
        )
        user_prompt = (
            f"Language hint: {language}\n"
            f"Task: {task}\n"
            f"Selected text:\n{selected_text}\n\n"
            f"Voice instruction:\n{instruction or '(none)'}\n"
            + (f"\nCustom prompt:\n{custom_prompt}\n" if custom_prompt else "")
        )

        out, provider = self._call_llm(system_prompt, user_prompt)
        if out:
            return out.strip(), provider

        # No rule-based rewrite here by request; keep original text.
        return selected_text, "fallback_original_text"

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
            return "", "fallback_empty_input"
        if not question:
            return "Question is empty.", "fallback_empty_question"

        system_prompt = (
            "You are a Q&A assistant. "
            "Answer only from the provided selected text. "
            "If context is insufficient, say that clearly. "
            "Keep the answer concise."
        )
        user_prompt = (
            f"Language hint: {language}\n"
            f"Selected text:\n{selected_text}\n\n"
            f"Question:\n{question}\n"
        )

        out, provider = self._call_llm(system_prompt, user_prompt)
        if out:
            return out.strip(), provider

        return "Model call failed. Please retry.", "fallback_model_failed"
