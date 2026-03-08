"""AI-powered text refinement with multi-provider LLM support.

Supports:
- claude CLI (haiku) - default, no API key needed
- Anthropic SDK - for direct API calls (reserved)
- Custom API - for local/domestic models (reserved)
"""

import asyncio
import logging
from typing import Optional

logger = logging.getLogger(__name__)


class AIRefiner:
    def __init__(
        self,
        provider: str = "claude_cli",
        model: str = "haiku",
        custom_api_url: str = "",
        custom_api_key: str = "",
        timeout: int = 30,
    ):
        self.provider = provider
        self.model = model
        self.custom_api_url = custom_api_url
        self.custom_api_key = custom_api_key
        self.timeout = timeout

    def should_refine(self, text: str, hotwords: list[str]) -> bool:
        """Determine if text should be refined. Triggers when hotwords exist."""
        return len(hotwords) > 0 and len(text.strip()) > 0

    async def refine(self, text: str, hotwords: list[str]) -> str:
        """Refine transcribed text using LLM to correct hotword errors.

        Args:
            text: Transcribed text to refine.
            hotwords: List of correct terms to match against.

        Returns:
            Refined text, or original text if refinement fails.
        """
        if not self.should_refine(text, hotwords):
            return text

        prompt = self._build_hotword_prompt(text, hotwords)

        try:
            result = await self._call_llm(prompt)
            if result and len(result.strip()) > 0:
                return result.strip()
        except Exception as e:
            logger.warning(f"[AIRefiner] Refinement failed: {e}")

        return text

    def refine_sync(self, text: str, hotwords: list[str]) -> str:
        """Synchronous wrapper for refine(), for backward compatibility."""
        if not self.should_refine(text, hotwords):
            return text

        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # Already in async context, can't use run_until_complete
                return text
            return loop.run_until_complete(self.refine(text, hotwords))
        except RuntimeError:
            loop = asyncio.new_event_loop()
            try:
                return loop.run_until_complete(self.refine(text, hotwords))
            finally:
                loop.close()

    def _build_hotword_prompt(self, text: str, hotwords: list[str]) -> str:
        hotword_str = ", ".join(hotwords)
        return (
            f"请检查以下语音转写文本，将可能的识别错误修正为正确的专业术语。\n"
            f"热词列表：{hotword_str}\n"
            f"转写文本：{text}\n\n"
            f"仅修正与热词相关的明显错误，保持其他内容不变。"
            f"直接输出修正后的文本，不要添加任何解释。"
        )

    async def _call_llm(self, prompt: str) -> str:
        """Route to the configured LLM provider."""
        if self.provider == "claude_cli":
            return await self._call_claude_cli(prompt)
        elif self.provider == "anthropic_api":
            return await self._call_anthropic_api(prompt)
        elif self.provider == "custom":
            return await self._call_custom_api(prompt)
        else:
            raise ValueError(f"Unknown LLM provider: {self.provider}")

    async def _call_claude_cli(self, prompt: str) -> str:
        """Call claude CLI in headless mode."""
        proc = await asyncio.create_subprocess_exec(
            "claude", "--model", self.model, "--print", "-p", prompt,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=self.timeout
            )
            output = stdout.decode("utf-8", errors="replace").strip()
            if proc.returncode != 0:
                logger.warning(
                    f"[AIRefiner] claude CLI returned {proc.returncode}: "
                    f"{stderr.decode('utf-8', errors='replace')}"
                )
            return output
        except asyncio.TimeoutError:
            proc.kill()
            logger.warning("[AIRefiner] claude CLI timed out")
            return ""

    async def _call_anthropic_api(self, prompt: str) -> str:
        """Call Anthropic API directly. Reserved for future use."""
        raise NotImplementedError(
            "Anthropic API provider not yet implemented. "
            "Install anthropic SDK and configure API key."
        )

    async def _call_custom_api(self, prompt: str) -> str:
        """Call custom API endpoint. Reserved for local/domestic models."""
        raise NotImplementedError(
            "Custom API provider not yet implemented. "
            "Configure custom_api_url and custom_api_key."
        )
