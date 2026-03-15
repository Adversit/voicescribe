# FireRedASR 集成问题与解决方案

日期: 2026-03-11

## 问题 1: FireRedASR Python 包安装失败

**现象**: `pip install git+https://github.com/FireRedTeam/FireRedASR.git` 报错 `neither 'setup.py' nor 'pyproject.toml' found`

**原因**: GitHub 仓库是研究代码，没有打包配置文件，无法通过 git 安装。

**解决方案**: PyPI 上有官方发布的包，直接安装即可：
```bash
pip install fireredasr
```

**文件变更**: `backend/requirements.txt`
```diff
- git+https://github.com/FireRedTeam/FireRedASR.git  # FireRedASR (best Chinese ASR)
+ fireredasr>=0.0.2  # FireRedASR (best Chinese ASR, CER 3.18%)
```

---

## 问题 2: `FireRedAsr.from_pretrained()` API 不兼容

**现象**: `TypeError: FireRedAsr.from_pretrained() got an unexpected keyword argument 'model_type'`

**原因**: PyPI 版本的 `from_pretrained` 签名为 `from_pretrained(asr_type)`，只接受一个参数 `"aed"` 或 `"llm"`，且内部强制从 HuggingFace 下载，无法传入本地路径。

**解决方案**: 绕过 `from_pretrained`，直接使用底层组件从本地文件构建模型：
```python
from fireredasr.models.fireredasr import (
    FireRedAsr, ASRFeatExtractor,
    load_fireredasr_aed_model, ChineseCharEnglishSpmTokenizer,
)

feat_extractor = ASRFeatExtractor(os.path.join(model_dir, "cmvn.ark"))
aed_model = load_fireredasr_aed_model(os.path.join(model_dir, "model.pth.tar"))
tokenizer = ChineseCharEnglishSpmTokenizer(
    os.path.join(model_dir, "dict.txt"),
    os.path.join(model_dir, "train_bpe1000.model"),
)
aed_model.eval()
model = FireRedAsr("aed", feat_extractor, aed_model, tokenizer)
```

同时，`transcribe` 调用也需要使用正确的批量格式：
```python
# 错误 (旧代码)
results = model.transcribe([audio_path], {"use_gpu": True, "beam_size": 5})

# 正确 (需要传 uttid 列表)
results = model.transcribe(["utt1"], [audio_path], {"use_gpu": True, "beam_size": 5})
```

另外需要处理 HuggingFace cache 目录结构：模型下载到 `models/huggingface/models--FireRedTeam--FireRedASR-AED-L/snapshots/<hash>/`，需要自动定位到 snapshot 子目录：
```python
def _resolve_model_dir(path: str) -> str:
    if os.path.isfile(os.path.join(path, "model.pth.tar")):
        return path
    snapshots_dir = os.path.join(path, "snapshots")
    if os.path.isdir(snapshots_dir):
        entries = [os.path.join(snapshots_dir, d) for d in os.listdir(snapshots_dir)]
        if entries:
            return max(entries, key=os.path.getmtime)
    return path
```

**文件变更**: `backend/engines/firered_engine.py` (完整重写 `load()` 和 `transcribe()`)

---

## 问题 3: PyTorch 2.6+ 模型加载报错 `weights_only`

**现象**: `_pickle.UnpicklingError: Weights only load failed... Unsupported global: GLOBAL argparse.Namespace`

**原因**: PyTorch 2.6 将 `torch.load` 的 `weights_only` 默认值从 `False` 改为 `True`。FireRedASR 的 checkpoint 包含 `argparse.Namespace` 对象，不在安全白名单中。

**解决方案**: 在加载模型前将 `argparse.Namespace` 加入白名单：
```python
import argparse
import torch
torch.serialization.add_safe_globals([argparse.Namespace])
```

**文件变更**: `backend/engines/firered_engine.py` (load 方法中添加)

---

## 问题 4: ModelScope 下载路径重复 (`models/models/`)

**现象**: 说话人模型下载到 `models/models/damo/...`，出现双重 `models` 目录。

**原因**: `MODELSCOPE_CACHE` 环境变量被设置为 `models/` 目录本身，而 ModelScope 会在 `MODELSCOPE_CACHE` 下再创建 `models/` 子目录存放模型，导致路径为 `models/models/`。

**解决方案**: `MODELSCOPE_CACHE` 应指向 `models/` 的父目录（项目根目录），这样 ModelScope 创建的 `models/` 子目录恰好就是我们的模型目录：
```python
# 修复前
def _derive_modelscope_cache_root(model_dir: str) -> str:
    p = Path(model_dir)
    if len(p.parts) >= 2 and p.parts[-2].lower() == "hub" and p.parts[-1].lower() == "models":
        return str(p.parent.parent)
    return str(p)  # 错误：直接返回 models/ 目录

# 修复后
def _derive_modelscope_cache_root(model_dir: str) -> str:
    p = Path(model_dir)
    if p.name.lower() == "models":
        return str(p.parent)  # 返回 models/ 的父目录
    return str(p)
```

**文件变更**: `backend/server.py`

---

## 问题 5: 说话人模型每次启动重复下载

**现象**: 说话人验证模型 (`damo/speech_campplus_sv_zh-cn_16k-common`) 和分离模型已存在于本地 `models/` 目录，但每次启动仍触发 ModelScope 下载。

**原因**: `diarization/speaker.py` 传给 FunASR `AutoModel` 的是 ModelScope 模型 ID（如 `"damo/speech_campplus_sv_zh-cn_16k-common"`），而非本地路径。ModelScope 无法识别手动迁移的模型缓存，导致重新下载。

**解决方案**: 添加 `_resolve_model()` 方法，优先检查本地 `models/` 目录是否已存在对应模型，存在则直接传本地路径：
```python
@staticmethod
def _resolve_model(model_id: str) -> str:
    cache_dir = os.environ.get("VOICESCRIBE_MODEL_DIR")
    if not cache_dir:
        cache_dir = str(Path(__file__).parent.parent.parent / "models")
    local_path = os.path.join(cache_dir, model_id.replace("/", os.sep))
    if os.path.isdir(local_path):
        return local_path  # 使用本地路径，跳过下载
    return model_id  # 本地不存在，回退到 ModelScope 下载
```

**文件变更**: `backend/diarization/speaker.py`

---

## 问题 6: 前端引擎默认值不统一

**现象**: `store.ts` 默认引擎是 `firered`，但 `EngineSettings.tsx` 和 `MeetingRecorder.tsx` 的 fallback 仍是 `funasr`。

**解决方案**: 统一所有 fallback 默认值为 `firered`:
```typescript
// EngineSettings.tsx & MeetingRecorder.tsx
engine: settings?.engine || "firered",       // was "funasr"
model: settings?.model || "firered-aed-l",   // was "seaco-paraformer"
```

**文件变更**: `frontend/src/components/settings/EngineSettings.tsx`, `frontend/src/components/MeetingRecorder.tsx`

---

## 问题 7: `SpeakerDiarizer` 缺少 `load_speaker_embedding` 方法

**现象**: `WARNING: 'SpeakerDiarizer' object has no attribute 'load_speaker_embedding'`

**原因**: `server.py` 的 `/meeting` WebSocket 端点调用了 `diarizer.load_speaker_embedding(spk["id"])`，但该方法从未在 `SpeakerDiarizer` 类中定义。

**解决方案**: 在 `SpeakerDiarizer` 中添加 `load_speaker_embedding` 方法，优先从内存获取，否则从 `.npy` 文件加载：
```python
def load_speaker_embedding(self, speaker_id: str) -> Optional[np.ndarray]:
    sp = self.speakers.get(speaker_id)
    if sp and "embedding" in sp:
        return sp["embedding"]
    emb_file = self.data_dir / f"{speaker_id}.npy"
    if emb_file.exists():
        emb = np.load(emb_file)
        if sp:
            sp["embedding"] = emb
        return emb
    return None
```

**文件变更**: `backend/diarization/speaker.py`

---

## 问题 8: diart / pyannote 依赖未安装

**现象**:
```
WARNING: diart not available, speaker tracking disabled
WARNING: Embedding extraction failed: No module named 'pyannote'
```

**原因**: `requirements.txt` 中声明了 `diart==0.9.0` 和 `pyannote.audio>=3.1`，但实际 conda 环境中未安装。

**解决方案**:
```bash
conda activate voicescribe
pip install silero-vad==5.1.2 diart==0.9.0 "pyannote.audio>=3.1" "rx>=3.2.0"
```

---

## 问题 9: 模型缓存分散在 C 盘多个位置

**现象**: 模型分散在 C 盘三个不同缓存目录，占用 C 盘空间：
- `C:/Users/DingK/.cache/torch/hub/` — silero-vad (35MB)、pyannote checkpoints (45MB)
- `C:/Users/DingK/.cache/huggingface/hub/` — faster-whisper 模型 (4.1GB)
- `C:/Users/DingK/.cache/modelscope/` — FunASR 模型（已在之前迁移）

**原因**: PyTorch、HuggingFace、ModelScope 各自使用默认缓存目录 (`~/.cache/`)，未统一重定向。

**解决方案**:

1. 在 `server.py` 启动时统一设置所有缓存环境变量：
```python
os.environ.setdefault("MODELSCOPE_CACHE", _derive_modelscope_cache_root(MODEL_CACHE_DIR))
os.environ.setdefault("TORCH_HOME", os.path.join(MODEL_CACHE_DIR, "torch"))
os.environ.setdefault("HF_HOME", os.path.join(MODEL_CACHE_DIR, "huggingface"))
```

2. 迁移已有缓存到项目 `models/` 目录：
```bash
# torch hub (silero-vad, pyannote checkpoints)
cp -r ~/.cache/torch/hub/* models/torch/hub/

# HuggingFace (faster-whisper 模型)
cp -r ~/.cache/huggingface/hub/models--Systran--faster-whisper-* models/huggingface/
```

3. 删除 C 盘旧缓存释放空间。

**迁移后 `models/` 目录结构**:
```
models/
├── damo/                    # ModelScope: 说话人验证 (CAM++)
├── iic/                     # ModelScope: FunASR ASR + 说话人分离
├── huggingface/             # HuggingFace Hub
│   ├── models--FireRedTeam--FireRedASR-AED-L/    # 4.4GB
│   ├── models--Systran--faster-whisper-base/      # 142MB
│   ├── models--Systran--faster-whisper-medium/    # 1.1GB
│   └── models--Systran--faster-whisper-large-v3/  # 2.9GB
├── torch/                   # PyTorch Hub
│   └── hub/
│       ├── snakers4_silero-vad_master/  # 35MB
│       └── checkpoints/                  # 45MB (pyannote)
└── voicescribe_models.json  # 模型注册表
```

总计约 14GB，全部集中在项目目录下。

**文件变更**: `backend/server.py`

---

## 架构备注: 两套说话人识别系统

当前系统中存在两套说话人识别，服务于不同场景：

| 模块 | 技术栈 | 使用场景 | 位置 |
|------|--------|---------|------|
| `DiartSpeakerTracker` | diart + pyannote.audio | 会议录制模式 (WebSocket `/meeting`) | `backend/meeting/speaker_tracker.py` |
| `SpeakerDiarizer` | FunASR CAM++ | 单次转录 (`/transcribe`) | `backend/diarization/speaker.py` |

这符合计划文档 (`docs/plans/2026-03-08-meeting-recording-design.md`) 的设计：会议模式使用 diart 实时流式分离，单次转录使用 FunASR 离线后处理。

---

## 涉及的文件清单

| 文件 | 变更内容 |
|------|---------|
| `backend/requirements.txt` | fireredasr 包名修正 |
| `backend/engines/firered_engine.py` | 完整重写：本地模型加载、PyTorch 兼容、正确的 API 调用 |
| `backend/server.py` | MODELSCOPE_CACHE 路径修正、HF snapshot 路径解析、TORCH_HOME/HF_HOME 重定向、load_speaker_embedding 调用修正 |
| `backend/diarization/speaker.py` | 添加 `load_speaker_embedding` 方法、本地模型路径优先解析 |
| `frontend/src/components/settings/EngineSettings.tsx` | 默认引擎改为 firered |
| `frontend/src/components/MeetingRecorder.tsx` | 默认引擎改为 firered |
