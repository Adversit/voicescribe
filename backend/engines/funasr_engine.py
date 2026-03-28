"""
FunASR Engine
阿里达摩院开源的语音识别，中文效果极佳
"""

from typing import Dict, Any, Optional


class FunASREngine:
    """FunASR 语音识别引擎"""
    
    MODELS = {
        "paraformer-zh": "iic/speech_paraformer-large-vad-punc_asr_nat-zh-cn-16k-common-vocab8404-pytorch",
        "paraformer-zh-streaming": "iic/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-online",
        "seaco-paraformer": "iic/speech_seaco_paraformer_large_asr_nat-zh-cn-16k-common-vocab8404-pytorch",
        "sensevoice-small": "iic/SenseVoiceSmall",
    }
    
    def __init__(self):
        self.model = None
        self.model_name = None
    
    def load(self, model_name: str = "paraformer-zh", enable_diarization: bool = False):
        """加载模型"""
        if model_name not in self.MODELS:
            raise ValueError(f"Unknown model: {model_name}. Available: {list(self.MODELS.keys())}")
        
        from funasr import AutoModel
        
        model_id = self.MODELS[model_name]
        
        device = self._get_device()
        print(f"[FunASR] Using device: {device}")

        self.enable_diarization = enable_diarization

        diarization_kwargs = {}
        if enable_diarization:
            # 使用 FunASR 内置 CAM++ 说话人特征（spk_model）
            diarization_kwargs = {
                "spk_model": "cam++",
                "spk_mode": "punc_segment",
            }

        if model_name == "sensevoice-small":
            # SenseVoice 特殊配置
            self.model = AutoModel(
                model=model_id,
                vad_model="fsmn-vad",
                vad_kwargs={"max_single_segment_time": 30000},
                device=device,
                **diarization_kwargs,
            )
        elif model_name == "seaco-paraformer":
            # SeACo-Paraformer: 专门针对热词优化的模型
            # 热词召回率比普通 Paraformer 高很多
            self.model = AutoModel(
                model=model_id,
                model_revision="v2.0.4",
                vad_model="fsmn-vad",
                punc_model="ct-punc",
                device=device,
                **diarization_kwargs,
            )
        else:
            # Paraformer 系列 - 启用 VAD 和标点预测
            self.model = AutoModel(
                model=model_id,
                model_revision="v2.0.4",
                vad_model="fsmn-vad",
                punc_model="ct-punc",
                device=device,
                **diarization_kwargs,
            )
        
        self.model_name = model_name
        if enable_diarization:
            print(f"[FunASR] Loaded model with diarization: {model_name}")
        else:
            print(f"[FunASR] Loaded model: {model_name}")
    
    def _get_device(self) -> str:
        """获取最佳计算设备：CUDA > MPS > CPU"""
        try:
            import torch
            if torch.cuda.is_available():
                return "cuda:0"
            elif torch.backends.mps.is_available():
                return "mps"
            else:
                return "cpu"
        except:
            return "cpu"

    def _clean_chinese_text(self, text: str) -> str:
        """去除中文字符之间的多余空格"""
        import re
        # 去除中文字符之间的空格
        text = re.sub(r'([\u4e00-\u9fff])\s+([\u4e00-\u9fff])', r'\1\2', text)
        # 多次执行以处理连续空格
        text = re.sub(r'([\u4e00-\u9fff])\s+([\u4e00-\u9fff])', r'\1\2', text)
        # 去除中文和标点之间的空格
        punctuation = '，。！？、；：""\'\'（）'
        text = re.sub(rf'([\u4e00-\u9fff])\s+([{punctuation}])', r'\1\2', text)
        text = re.sub(rf'([{punctuation}])\s+([\u4e00-\u9fff])', r'\1\2', text)
        return text.strip()
    
    def transcribe(
        self,
        audio_path: str,
        language: str = "zh",
        hotwords: str = "",
        **kwargs
    ) -> Dict[str, Any]:
        """
        转录音频文件

        Args:
            audio_path: 音频文件路径
            language: 语言代码（FunASR 主要针对中文优化）
            hotwords: 热词列表（逗号分隔），提高特定词识别率

        Returns:
            {
                "text": "完整文本",
                "segments": [{"start": 0.0, "end": 2.5, "text": "..."}],
                "duration": 总时长
            }
        """
        if self.model is None:
            raise RuntimeError("Model not loaded. Call load() first.")

        # 处理热词：支持两种格式
        # 1. 不带权重：claude, deepseek → "claude deepseek"
        # 2. 带权重：claude 50, deepseek 30 → "claude 50 deepseek 30"
        hotword_str = ""
        if hotwords:
            parts = [p.strip() for p in hotwords.split(",") if p.strip()]
            hotword_str = " ".join(parts)
            print(f"[FunASR] Hotwords: {hotword_str}")

        result = self.model.generate(
            input=audio_path,
            batch_size_s=300,  # 每批处理 300 秒
            hotword=hotword_str,
        )
        
        # 解析结果
        if not result:
            return {"text": "", "segments": [], "duration": 0}
        
        # FunASR 返回格式处理
        output = result[0] if isinstance(result, list) else result
        
        text = output.get("text", "")

        # 去除中文字符之间的空格
        text = self._clean_chinese_text(text)

        # 解析时间戳（如果有）
        segments = []
        sentences = output.get("sentence_info", [])
        if sentences:
            for sent in sentences:
                speaker = None
                if "spk" in sent:
                    try:
                        speaker = f"SPEAKER_{int(sent.get('spk', 0)):02d}"
                    except Exception:
                        speaker = None
                segment = {
                    "start": sent.get("start", 0) / 1000,  # ms -> s
                    "end": sent.get("end", 0) / 1000,
                    "text": sent.get("text", ""),
                }
                if speaker:
                    segment["speaker"] = speaker
                segments.append(segment)
        
        # 计算时长
        duration = 0
        if segments:
            duration = segments[-1]["end"]
        
        return {
            "text": text,
            "segments": segments,
            "duration": duration,
            "language": language,
        }
    
    def unload(self):
        """卸载模型释放内存"""
        self.model = None
        self.model_name = None
        
        import gc
        import torch
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
