"""
Parakeet ASR Engine
NVIDIA 的高性能语音识别模型
注意：需要 NVIDIA GPU 和 NeMo toolkit
"""

from typing import Dict, Any, Optional


class ParakeetEngine:
    """NVIDIA Parakeet 语音识别引擎"""
    
    MODELS = {
        "parakeet-ctc-1.1b": "nvidia/parakeet-ctc-1.1b",
        "parakeet-tdt-1.1b": "nvidia/parakeet-tdt-1.1b",
    }
    
    def __init__(self):
        self.model = None
        self.model_name = None
    
    def load(self, model_name: str = "parakeet-ctc-1.1b"):
        """
        加载模型
        
        注意：Parakeet 需要 NVIDIA GPU 和 NeMo toolkit
        安装：pip install nemo_toolkit['asr']
        """
        if model_name not in self.MODELS:
            raise ValueError(f"Unknown model: {model_name}. Available: {list(self.MODELS.keys())}")
        
        try:
            import nemo.collections.asr as nemo_asr
        except ImportError:
            raise ImportError(
                "Parakeet requires NeMo toolkit. "
                "Install with: pip install nemo_toolkit['asr']"
            )
        
        import torch
        if not torch.cuda.is_available():
            raise RuntimeError(
                "Parakeet requires NVIDIA GPU with CUDA support. "
                "Please install GPU support by running: scripts\\windows\\install_gpu.bat (Windows) "
                "or use other engines (Whisper, FunASR) that support CPU."
            )
        
        model_id = self.MODELS[model_name]
        self.model = nemo_asr.models.ASRModel.from_pretrained(model_id)
        self.model_name = model_name
        
        print(f"[Parakeet] Loaded model: {model_name}")
        print(f"[Parakeet] Using GPU: {torch.cuda.get_device_name(0)}")
    
    def transcribe(
        self,
        audio_path: str,
        language: str = "en",  # Parakeet 主要支持英文
        **kwargs
    ) -> Dict[str, Any]:
        """
        转录音频文件
        
        Args:
            audio_path: 音频文件路径
            language: 语言代码
            
        Returns:
            {
                "text": "完整文本",
                "segments": [],
                "duration": 总时长
            }
        """
        if self.model is None:
            raise RuntimeError("Model not loaded. Call load() first.")
        
        # Parakeet 直接返回文本
        transcription = self.model.transcribe([audio_path])
        
        text = transcription[0] if transcription else ""
        
        return {
            "text": text,
            "segments": [],  # Parakeet 不返回时间戳
            "duration": 0,
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
