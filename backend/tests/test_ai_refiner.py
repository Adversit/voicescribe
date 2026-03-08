import pytest
from postprocess.ai_refiner import AIRefiner


class TestAIRefiner:
    def test_init_default_provider(self):
        refiner = AIRefiner()
        assert refiner.provider == "claude_cli"

    def test_init_custom_provider(self):
        refiner = AIRefiner(provider="anthropic_api")
        assert refiner.provider == "anthropic_api"

    def test_should_refine_with_hotwords(self):
        refiner = AIRefiner()
        assert refiner.should_refine("中文文本", ["LLM", "GPT"]) is True

    def test_should_not_refine_without_hotwords(self):
        refiner = AIRefiner()
        assert refiner.should_refine("中文文本", []) is False

    def test_build_hotword_prompt(self):
        refiner = AIRefiner()
        prompt = refiner._build_hotword_prompt("测试LM文本", ["LLM", "GPT"])
        assert "LLM" in prompt
        assert "GPT" in prompt
        assert "测试LM文本" in prompt
