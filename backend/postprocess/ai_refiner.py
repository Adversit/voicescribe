"""
AI 文本优化模块 - 使用 Claude Code 无头模式
"""
import subprocess
from pathlib import Path

DEFAULT_PROMPT = """你是一个语音转文字的后处理专家。请对以下语音转录文本进行优化：

1. 删除语气词（呃、嗯、啊、额、那个、就是、然后、对吧、这个、所以说）
2. 修正明显的错别字和语法错误
3. 保持原意不变，不要添加或删减实质内容
4. 保留原有的标点符号风格

{hotwords_section}

请直接输出优化后的文本，不要添加任何解释、前缀或额外内容。"""


class AIRefiner:
    def __init__(self):
        self.config_dir = Path.home() / ".voicescribe"
        self.prompt_file = self.config_dir / "refine_prompt.txt"
        self._ensure_config_dir()

    def _ensure_config_dir(self):
        self.config_dir.mkdir(parents=True, exist_ok=True)
        # 如果没有自定义 prompt，创建默认模板
        if not self.prompt_file.exists():
            self.prompt_file.write_text(DEFAULT_PROMPT, encoding="utf-8")

    def _load_prompt_template(self) -> str:
        if self.prompt_file.exists():
            return self.prompt_file.read_text(encoding="utf-8")
        return DEFAULT_PROMPT

    def _build_prompt(self, hotwords: list = None) -> str:
        template = self._load_prompt_template()

        if hotwords and len(hotwords) > 0:
            hotwords_section = "以下是需要特别注意的专有名词（热词），请确保正确识别：\n"
            hotwords_section += "\n".join(f"- {word}" for word in hotwords if word.strip())
        else:
            hotwords_section = ""

        return template.replace("{hotwords_section}", hotwords_section)

    def refine(self, text: str, hotwords: list = None, timeout: int = 30) -> str:
        if not text or not text.strip():
            return text

        prompt = self._build_prompt(hotwords)
        full_prompt = f"{prompt}\n\n原文：\n{text}"

        try:
            result = subprocess.run(
                ["claude", "--model", "haiku", "--print", full_prompt],
                capture_output=True,
                text=True,
                timeout=timeout,
            )

            if result.returncode == 0 and result.stdout.strip():
                return result.stdout.strip()
            else:
                print(f"[AIRefiner] Warning: {result.stderr}")
                return text  # 失败时返回原文

        except subprocess.TimeoutExpired:
            print("[AIRefiner] Timeout, returning original text")
            return text
        except FileNotFoundError:
            print("[AIRefiner] claude CLI not found")
            return text
        except Exception as e:
            print(f"[AIRefiner] Error: {e}")
            return text
