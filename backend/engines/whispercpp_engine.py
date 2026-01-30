"""
Whisper.cpp 引擎 - 使用命令行工具进行转录
"""

import subprocess
import tempfile
import os
import json
from pathlib import Path

# 繁简转换
try:
    from opencc import OpenCC
    cc = OpenCC('t2s')  # 繁体转简体
    OPENCC_AVAILABLE = True
except ImportError:
    OPENCC_AVAILABLE = False
    cc = None


class WhisperCppEngine:
    """基于 whisper.cpp 命令行工具的转录引擎"""
    
    def __init__(self, model_path: str = None, language: str = "auto"):
        """
        初始化引擎
        
        Args:
            model_path: 模型文件路径，默认使用 ~/.whisper-models/ggml-base.bin
            language: 语言代码，如 "zh", "en", "auto"
        """
        if model_path is None:
            model_path = os.path.expanduser("~/.whisper-models/ggml-base.bin")
        
        self.model_path = model_path
        self.language = language
        self.whisper_cli = "/opt/homebrew/bin/whisper-cli"
        
        # 验证模型文件存在
        if not os.path.exists(self.model_path):
            raise FileNotFoundError(f"模型文件不存在: {self.model_path}")
        
        # 验证 whisper-cli 存在
        if not os.path.exists(self.whisper_cli):
            raise FileNotFoundError(f"whisper-cli 未安装: {self.whisper_cli}")
    
    def transcribe(self, audio_path: str, language: str = None) -> dict:
        """
        转录音频文件
        
        Args:
            audio_path: 音频文件路径 (支持 wav, mp3, flac, ogg)
            language: 语言代码（可选，覆盖初始化时的设置）
            
        Returns:
            dict: {
                "text": str,  # 完整转录文本
                "segments": list,  # 分段信息
                "language": str  # 检测到的语言
            }
        """
        # 使用传入的语言或默认语言
        lang = language or self.language
        
        # 构建命令 (GPU/Metal 默认启用)
        cmd = [
            self.whisper_cli,
            "-m", self.model_path,
            "-f", audio_path,
            "-oj",  # 输出 JSON 格式
            "-t", "4",  # 使用 4 线程
        ]

        # 如果指定了语言
        if lang and lang != "auto":
            cmd.extend(["-l", lang])
        
        try:
            # 运行 whisper-cli
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300  # 5 分钟超时
            )
            
            if result.returncode != 0:
                raise RuntimeError(f"whisper-cli 错误: {result.stderr}")
            
            # 解析 JSON 输出
            # whisper-cli -oj 会输出 JSON 到 stdout
            try:
                output = json.loads(result.stdout)
                return {
                    "text": output.get("text", "").strip(),
                    "segments": output.get("transcription", []),
                    "language": output.get("language", lang)
                }
            except json.JSONDecodeError:
                # 如果不是 JSON，解析文本格式输出
                # 格式: [00:00:00.000 --> 00:00:03.920] 文本内容
                import re
                lines = result.stdout.strip().split('\n')
                segments = []
                full_text = []
                
                pattern = r'\[(\d+:\d+:\d+\.\d+) --> (\d+:\d+:\d+\.\d+)\]\s*(.*)'
                for line in lines:
                    match = re.match(pattern, line)
                    if match:
                        start_str, end_str, text = match.groups()
                        # 转换时间格式 HH:MM:SS.mmm -> 秒
                        def time_to_seconds(t):
                            parts = t.split(':')
                            h, m, s = int(parts[0]), int(parts[1]), float(parts[2])
                            return h * 3600 + m * 60 + s
                        
                        segments.append({
                            "start": time_to_seconds(start_str),
                            "end": time_to_seconds(end_str),
                            "text": text.strip()
                        })
                        full_text.append(text.strip())
                
                # 繁体转简体
                if OPENCC_AVAILABLE and lang in ('zh', 'chinese'):
                    full_text = [cc.convert(t) for t in full_text]
                    for seg in segments:
                        seg['text'] = cc.convert(seg['text'])

                # 拼接文本（中日韩不加空格，其他语言加空格）
                if lang in ('zh', 'chinese', 'ja', 'japanese', 'ko', 'korean'):
                    text = "".join(full_text) if full_text else result.stdout.strip()
                else:
                    text = " ".join(full_text) if full_text else result.stdout.strip()

                return {
                    "text": text,
                    "segments": segments,
                    "language": lang
                }
                
        except subprocess.TimeoutExpired:
            raise RuntimeError("转录超时（超过 5 分钟）")
        except Exception as e:
            raise RuntimeError(f"转录失败: {str(e)}")
    
    def transcribe_bytes(self, audio_data: bytes, sample_rate: int = 16000) -> dict:
        """
        转录音频字节数据
        
        Args:
            audio_data: WAV 格式的音频数据
            sample_rate: 采样率
            
        Returns:
            dict: 转录结果
        """
        # 保存到临时文件
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            f.write(audio_data)
            temp_path = f.name
        
        try:
            return self.transcribe(temp_path)
        finally:
            # 清理临时文件
            os.unlink(temp_path)


# 测试代码
if __name__ == "__main__":
    import sys
    
    engine = WhisperCppEngine()
    print(f"模型路径: {engine.model_path}")
    print(f"whisper-cli: {engine.whisper_cli}")
    
    if len(sys.argv) > 1:
        audio_file = sys.argv[1]
        print(f"\n转录文件: {audio_file}")
        result = engine.transcribe(audio_file)
        print(f"结果: {result['text']}")
