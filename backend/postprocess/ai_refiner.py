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


HOTWORD_REPLACEMENT_PROMPT = """语音识别经常把专有名词误识别为发音相似的常见词。

**热词列表：** {hotwords}

**原文：** {text}

**任务：** 检查原文，如果某个词与热词发音相似但被误识别为常见词，将其替换为热词。

**判断标准：**
1. 发音相似（中英文谐音都算）
2. 上下文合理（技术讨论中更可能是专有名词）

直接输出修正后的文本，不要解释。如果没有需要修正的，原样输出。"""


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

        # 智能判断：只有当检测到可能的英文专有名词误识别时才调用 AI
        if hotwords and len(hotwords) > 0:
            if self._needs_hotword_correction(text, hotwords):
                print("[AIRefiner] 检测到英文，启用 AI 修正")
                return self._replace_hotwords(text, hotwords, timeout)
            else:
                print("[AIRefiner] 无英文，跳过 AI 修正")
                return text

        # 没有热词时，直接返回原文
        return text

    def _needs_hotword_correction(self, text: str, hotwords: list) -> bool:
        """
        智能检测是否需要热词修正
        逻辑：文本中有英文词（可能是误识别）→ 调用 AI
        """
        import re
        return bool(re.search(r'[a-zA-Z]{2,}', text))

    def _replace_hotwords(self, text: str, hotwords: list, timeout: int = 30) -> str:
        """专门针对热词的替换处理"""
        hotwords_str = ", ".join(hotwords)
        prompt = HOTWORD_REPLACEMENT_PROMPT.format(hotwords=hotwords_str, text=text)

        try:
            result = subprocess.run(
                ["claude", "--model", "haiku", "--print", prompt],
                capture_output=True,
                text=True,
                timeout=timeout,
            )

            if result.returncode == 0 and result.stdout.strip():
                replaced = result.stdout.strip()
                print(f"[AIRefiner] Hotword replacement: {text[:50]}... -> {replaced[:50]}...")
                return replaced
            else:
                return text
        except Exception as e:
            print(f"[AIRefiner] Hotword replacement error: {e}")
            return text
