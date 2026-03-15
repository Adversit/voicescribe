# 说话人识别模型变更记录

> 日期: 2026-03-11

## 变更概述

将流式说话人追踪模块 (`backend/meeting/speaker_tracker.py`) 的 embedding 提取方案从"仅 diart/pyannote"改为**双后端降级策略**：优先使用 pyannote/embedding，不可用时自动降级到 FunASR CAM++。

## 变更原因

### 1. diart 兼容性问题

原始实现依赖 [diart](https://github.com/juanmc2005/diart)（基于 pyannote 的在线说话人分离库）。在 torchaudio 2.0+ 环境下，diart 在 import 阶段调用已移除的 `torchaudio.set_audio_backend()`，导致 ImportError 无法使用。

### 2. pyannote 4.x API 变更

pyannote.audio 从 3.x 升级到 4.x 后，`Inference("pyannote/embedding")` 不再接受字符串 model ID，必须先 `Model.from_pretrained()`。此外 `use_auth_token=True` 参数已废弃。

### 3. pyannote 模型需要授权

pyannote/embedding 是 HuggingFace 上的 gated model，需要：
- 在 HuggingFace 上接受 pyannote 的使用协议
- 配置 `HF_TOKEN` 环境变量

这对于不需要英文说话人识别或不想创建 HF 账号的用户造成了门槛。

### 4. CAM++ 更适合中文场景

| 模型 | 训练数据 | 维度 | 适合语言 |
|------|---------|------|---------|
| pyannote/embedding (ECAPA-TDNN) | VoxCeleb (英文为主) | 512d | 英文 |
| DAMO CAM++ (`speech_campplus_sv_zh-cn_16k-common`) | 20万+中文说话人 | 512d | 中文 |

CAM++ 专为中文优化，在中文场景下表现优于 pyannote。且无需任何授权，可直接使用。

## 当前架构

### 流式说话人追踪 (`meeting/speaker_tracker.py`)

采用惰性初始化 + 双后端降级：

```
初始化顺序:
1. pyannote/embedding (ECAPA-TDNN)
   - 需要: pip install pyannote.audio, HF_TOKEN 环境变量
   - 优点: 英文场景效果最佳
   - 缺点: 需要 HuggingFace 授权

2. FunASR CAM++ (降级方案)
   - 需要: pip install funasr (项目已包含)
   - 模型: damo/speech_campplus_sv_zh-cn_16k-common
   - 优点: 中文最优, 无需授权, 开箱即用
   - 缺点: 需要写临时 WAV 文件（FunASR 不支持直接传入 numpy 数组）

3. 如果两者都不可用 → 说话人识别功能关闭，不影响转录
```

### 离线说话人分离 (`diarization/speaker.py`)

仅使用 FunASR，未变更：
- 声纹验证: `damo/speech_campplus_sv_zh-cn_16k-common`
- 说话人分离: `iic/speech_campplus_speaker-diarization_common`

## 关键参数

| 参数 | 值 | 说明 |
|------|------|------|
| `match_threshold` | 0.6 | 余弦相似度阈值，低于此值不认为是已注册说话人 |
| clustering threshold | 0.5 | 聚类阈值，用于将未知说话人分配到已有/新建 cluster |
| `max_speakers` | 8 | 最大说话人数量 |

## 如何配置

### 使用 CAM++（默认，推荐中文用户）

无需额外配置，安装 `funasr` 即可：
```bash
pip install funasr
```

### 启用 pyannote（英文场景或追求最高质量）

1. 安装依赖:
   ```bash
   pip install pyannote.audio
   ```

2. 在 https://huggingface.co/pyannote/embedding 接受使用协议

3. 创建 HuggingFace token: https://huggingface.co/settings/tokens

4. 设置环境变量:
   ```bash
   export HF_TOKEN=hf_xxxxxxx
   ```

系统启动时会自动检测并使用 pyannote（优先级更高）。

## 模型文件位置

模型文件缓存位置优先级：
1. `VOICESCRIBE_MODEL_DIR` 环境变量指定的目录
2. 项目根目录下的 `models/` 文件夹
3. FunASR/HuggingFace 默认缓存目录
