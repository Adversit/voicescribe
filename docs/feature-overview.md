# VoiceScribe 功能总览

> 最后更新：2026-03-15

## 一句话定位

桌面端、本地优先的中文语音转录工具，支持文件上传转录、流式转录、说话人注册与识别、AI 摘要和历史导出。

---

## 当前功能结构

```
Electron 桌面应用
  -> 文件上传转录
  -> 流式实时转录
  -> 历史记录 / 导出

Python FastAPI 后端
  -> ASR 引擎
  -> Silero VAD
  -> pyannote clustering
  -> CAM++ speaker mapping
  -> AI refine / summary
```

---

## 核心能力

### 1. 文件上传转录

- 支持上传音频文件进行一次性转录
- 支持多引擎切换
- 可选说话人识别和 AI 文本优化

### 2. 流式实时转录

- 前端持续采集 PCM 音频，经 `WS /stream` 发送
- 后端使用 Silero VAD 做逐段切分
- 每个语音段实时返回 utterance
- 支持实时 speaker 状态和周期性摘要

### 3. 说话人识别

当前流式 speaker 链路：
- `pyannote` 负责分群
- `CAM++` 负责实名映射

当前注册链路：
- `/speakers/register` 使用声纹模型注册说话人
- 默认使用 CAM++ 体系

当前已支持：
- 多 speaker labels
- `speaker_spans`
- `overlap_detected`
- 一个 VAD 段内的 speaker 子段切分重转写

### 4. AI 后处理

- 文本 refine
- 周期性会议摘要
- 决策项提取
- 待办项提取

### 5. 历史与导出

- 历史记录持久化
- 说话人过滤
- 复制
- TXT / Markdown 导出
- `text_only / with_speakers / with_summary / full`

### 6. 模型管理

- 引擎页支持模型状态查看、下载、删除、加载
- speaker backend 支持重载
- 项目级 `models/` 目录优先

---

## 当前支持的 ASR 引擎

- `funasr`
- `whisper`
- `whispercpp`
- `parakeet`
- `firered`

已接入模型管理但尚未接入推理：
- `Qwen3-ASR`
- `FireRedASR2`

---

## 当前技术边界

- 已经支持“一个 VAD 段内识别不同说话人”
- 还不支持“同一时间点多人同时说话时的词级精确归属”
- overlap 检测仍是启发式，不是完整 overlap-aware diarization

---

## 当前重点优化方向

- speaker 防裂变与稳定性
- `speaker_spans` 质量
- 日志可解释性
- 更强的时间轴级 diarization
