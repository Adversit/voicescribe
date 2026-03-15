# VoiceScribe 流式转录与说话人识别阶段总结报告

> **版本**: v1.1  
> **日期**: 2026-03-15  
> **阶段**: 流式转录 / 说话人识别阶段总结  
> **状态**: 已更新  
> **范围**: 流式转录、说话人识别、模型加载、历史记录与导出

---

## 一、项目定位

**一句话**：面向中文、本地部署、小团队会议与日常语音场景的桌面端转录工具，支持实时流式转录、说话人识别、摘要和历史导出。

**当前核心价值**：
- 本地优先，模型优先使用项目级缓存目录 `models/`
- 支持文件上传转录和流式转录两条链路
- 支持说话人注册、实名映射、匿名分群和会议摘要
- 支持历史记录、筛选、复制与多格式导出

**当前边界**：
- 目标不是“同一时刻多人同时说话时的词级精确归属”
- 当前优先解决“一个 VAD 段内先后出现不同说话人”的识别与拆分
- 重叠说话目前只做到检测、标记和近似切分，未做到最终精确归属

---

## 二、开发路线总览

```
第一阶段                  第二阶段                     第三阶段
基础可用                  结构升级                     精度提升

流式转录链路打通          多 speaker labels            时间轴级 diarization
项目级模型加载            overlap 标记                 overlap-aware pipeline
pyannote + CAM++          speaker_spans                同时说话精确归属
说话人注册                VAD 内切段重转写             词级对齐 / 分离增强
历史记录与导出            防裂变稳定策略               更强 ASR / speaker 方案
```

**当前已完成主线**：
- 流式链路统一为 `ASR -> pyannote clustering -> CAM++ mapping`
- 引擎页加载模型时，会按设置联动 preload speaker backends
- 一个 utterance 已支持 `speakers`、`speaker_spans`、`overlap_detected`
- 一个 VAD 段内若识别到多个先后 speaker 子段，会按 span 切音频并分别重转写
- 已加入“防裂变”策略，减少单人说话被误裂成多个 speaker

---

## 三、当前阶段范围定义

### 3.1 Must Have（当前已落地）

| 模块 | 当前能力 |
|------|----------|
| 流式音频采集 | Electron 前端采集 16kHz PCM，经 WebSocket 发送到后端 |
| 流式转录 | Silero VAD 分段后调用 ASR 返回 utterance |
| 流式说话人识别 | `pyannote` 负责分群，`CAM++` 负责实名映射 |
| 说话人注册 | 使用 `SpeakerDiarizer` + 声纹模型注册说话人，默认走 CAM++ |
| 多 speaker 表达 | utterance 支持 `speakers`、`speaker_spans`、`active_speakers` |
| 段内切分重转写 | 对一个 VAD 内多个先后 speaker 子段做切段重转写 |
| 历史与导出 | 支持带 speaker 标签、摘要、完整记录导出 |
| 模型管理 | 支持引擎模型与 speaker backends 的加载、重载、状态查看 |

### 3.2 Reserve（已规划未完成）

| 模块 | 预留内容 | 当前状态 |
|------|----------|----------|
| 同时说话精确归属 | 同一时间点多人同时发言的文本拆分 | 未实现 |
| overlap-aware diarization | 真正的重叠感知时间轴 pipeline | 未实现 |
| 词级 speaker 对齐 | 词级时间戳与 speaker 归属 | 未实现 |
| 更强 speaker 平滑 | 更系统的 smoothing / hysteresis | 已有启发式，未完整化 |
| 更强 ASR 接入 | Qwen3-ASR / FireRedASR2 推理适配 | 仅完成下载与路径管理 |

---

## 四、功能需求详解

### 4.1 流式录音与传输

前端录音链路：
- 使用 WebAudio 采集 PCM
- 下采样为 `16kHz / mono / PCM16`
- 通过 `WS /stream` 持续发送音频块

后端流式链路：
- 收到二进制音频后按 `512 sample` 小块送入 VAD
- VAD 结束一段后交给 `MeetingSession.process_audio_segment()`
- 由会话层统一完成 ASR、speaker、摘要和历史落盘

### 4.2 ASR 引擎

当前可用推理引擎：
- `funasr`
- `whisper`
- `whispercpp`
- `parakeet`
- `firered`

当前仅完成模型管理、未完成推理适配：
- `Qwen3-ASR`
- `FireRedASR2`

补充说明：
- FunASR 已改为优先使用项目级 `models/` 本地目录，不再优先访问远程
- 引擎界面的“加载模型”会在流式或说话人识别启用时同步触发 speaker backend preload

### 4.3 说话人识别

当前流式链路采用两层模型：

1. 分群层：`pyannote/embedding`
- 负责匿名 speaker clustering
- 优先从项目级 `models/huggingface/hub/...` 加载

2. 映射层：`CAM++`（FunASR）
- 负责和已注册说话人做实名匹配
- 若 CAM++ 不可用，才退回 `pyannote` fallback

说话人注册链路：
- `/speakers/register` 使用 `SpeakerDiarizer`
- 当前注册与离线识别默认仍走声纹模型链路，默认模型是 `CAM++`

当前关键阈值：
- 流式 tracker `match_threshold = 0.6`
- 离线 diarizer `identify_speaker()` 默认阈值 `0.7`

### 4.4 多 speaker 表达与 VAD 内拆分

当前已经支持：
- 一个 utterance 带多个候选 speaker labels
- `overlap_detected` / `overlap_score`
- `speaker_spans`
- 对“一个 VAD 段内先后出现多个 speaker”按 span 切段并重新 ASR

这一步解决的是：
- A 先说，B 后说，但被 VAD 合并进同一段音频

这一步还没有解决的是：
- A 和 B 同时说话，且要精确知道各自说了哪些词

### 4.5 防裂变稳定策略

为减少“一个人说话被识别成多个 speaker”，当前已加入：
- 已注册 speaker 优先复用已命中的 cluster
- 子窗判断时优先保持稳定注册人
- 连续子窗优先延续前一个 speaker
- 新建匿名 cluster 的门槛提高

目标是：
- 证据不足时更保守
- 尽量维持一个说话人的连续性
- 减少 `Speaker 3 / Speaker 4 / Speaker 5` 式裂变

### 4.6 历史记录与导出

当前支持：
- 流式 utterances 实时显示
- 活跃 speaker 显示
- 历史记录持久化
- speaker 过滤
- `text_only / with_speakers / with_summary / full` 导出

导出内容已经支持多 speaker 标签与 `speaker_spans` 相关信息展示。

---

## 五、业务模块与流程设计

### 5.1 当前流式主流程

```
Electron 录音
  -> PCM16 / 16kHz
  -> WS /stream
  -> Silero VAD
  -> ASR 转写
  -> pyannote 分群
  -> CAM++ 实名映射
  -> speaker_spans 分析
  -> 必要时按 span 切段重转写
  -> utterance / speaker_active / summary / session_end
```

### 5.2 WebSocket 事件模型

客户端发送：
- `start`
- 二进制 PCM 音频
- `end`

服务端发送：
- `started`
- `utterance`
- `utterance_refined`
- `speaker_active`
- `summary`
- `session_end`
- `error`

### 5.3 utterance 数据结构

当前流式 utterance 已包含：
- `speaker`
- `speaker_id`
- `speakers`
- `text`
- `start` / `end`
- `confidence`
- `overlap_detected`
- `overlap_score`
- `speaker_spans`

这意味着当前系统已经能表达：
- 主 speaker
- 候选 speaker
- 段内多个 speaker 子段
- 疑似重叠

### 5.4 模型加载策略

当前统一原则：
- 优先使用项目级 `models/`
- 引擎页加载模型时，按功能开关联动 speaker backend preload
- `enableStreaming = true` 时优先 preload cluster backend
- `enableDiarization = true` 时 preload mapping backend

---

## 六、已完成工作与阶段结论

### 6.1 本阶段完成项

- 将流式 speaker 处理链路调整为 `ASR -> pyannote -> CAM++`
- 明确项目级模型目录优先级，并验证 `pyannote` 从项目级 snapshot 加载
- 将引擎页“加载模型”和 speaker backend preload 打通
- 为 utterance 增加多 speaker labels、overlap 标记和 `speaker_spans`
- 对一个 VAD 段内的多个先后 speaker 子段进行切段重转写
- 加入通用防裂变策略，降低单人被误裂成多 speaker 的概率

### 6.2 当前阶段结论

当前系统已经不再是“整段音频只能给一个 speaker”的旧结构，而是：
- 能表达多个 speaker labels
- 能表达段内 speaker 时间子段
- 能对一个 VAD 内多个先后 speaker 做拆分重转写

这已经满足当前阶段目标：
- 在一个 VAD 内识别不同说话人
- 尽量把文本拆回对应 speaker

---

## 七、已知问题与风险

### 7.1 当前仍存在的问题

- 同一时间点多人同时说话时，文本仍无法精确拆分到各自 speaker
- 说话人识别仍会受短句、插话、音量波动和噪声影响
- 当前 overlap 检测仍以启发式为主，不是真正的时间轴模型
- `Qwen3-ASR`、`FireRedASR2` 仍未接入实际推理

### 7.2 工程风险

- speaker 阈值与平滑策略仍需继续回归调优
- VAD 边界会直接影响 span 切分和 speaker 判断
- 流式 speaker 结果与 ASR 文本对齐仍是当前系统的主要技术边界

---

## 八、下一阶段计划

### 8.1 P0

- 增强后端日志，明确输出“加载了哪个模型、哪个阶段处理了什么”
- 继续优化 speaker 防裂变策略与回归样本
- 提升 `speaker_spans` 的稳定性和可解释性

### 8.2 P1

- 评估更强的时间轴级 diarization 方案
- 提升 overlap 检测质量
- 进一步区分“先后说话”和“同时说话”

### 8.3 P2

- 同一时间点多人同时说话的精确归属
- 词级 speaker 对齐
- 更强 ASR / separation / overlap-aware pipeline

---

**报告版本**: v1.1  
**更新日期**: 2026-03-15  
**说明**: 本文已按当前代码实现重写，旧版中涉及 `diart` 主链路、单 speaker utterance、未接线流式前端等描述均已失效。
