# VoiceScribe 会议录制功能设计文档

> 日期：2026-03-08
> 基准版本：`8ffc1a9`
> 硬件：RTX 4070（12GB VRAM）
> 场景：中文会议为主，包含英文 AI 热词

---

## 1. 概述

将 VoiceScribe 从"录完转写"升级为"实时会议录制"工具，参考腾讯会议的录制体验：按说话人分段显示转写、定时生成摘要、热词修正。

### 1.1 核心变更

| 维度 | 当前 | 目标 |
|------|------|------|
| 分片方式 | 固定 30s | Silero VAD 按语音停顿切段 |
| ASR 引擎 | FunASR Paraformer（CER ~4.5%） | FireRedASR-AED 1.1B（CER 3.18%），保留 FunASR 备选 |
| 说话人识别 | 离线后处理 | diart 实时分离（500ms 更新） |
| 前端显示 | overlay 波形+时长 | 主窗口录制 tab（说话人+文字+摘要） |
| 摘要 | 无 | 每 2-3 分钟增量摘要（claude CLI haiku） |
| 热词修正 | 仅英文、依赖 CLI | 有热词即触发、多 provider |
| 历史记录 | 纯文本 | 结构化（说话人+时间戳+摘要） |
| 输出格式 | 固定 | 用户可选（纯文本 / 带说话人 / 带摘要 / 完整） |

### 1.2 关键决策记录

| 决策 | 结论 | 理由 |
|------|------|------|
| 实施路径 | 渐进式（4 阶段） | 每阶段可独立运行验证，不破坏现有功能 |
| 摘要 LLM | claude CLI haiku 无头模式 | 成本低，预留小模型/国产模型 API 接口 |
| 说话人注册 | 保持现有设置页方式 | 够用，不增加复杂度 |
| 录制面板 | 主窗口新增"录制"tab | 信息量大，overlay 放不下 |
| 输出方式 | 用户可选格式 | 不同场景需求不同 |
| 历史记录 | 完整结构化数据 | 支持按说话人筛选、搜索 |
| ASR 引擎 | FireRedASR 为主，FunASR 备选 | FireRedASR 中文最优，FunASR 有流式和热词原生支持 |

### 1.3 显存预算

| 组件 | 显存 | 运行时机 |
|------|------|---------|
| FireRedASR-AED 1.1B | ~4.5GB | 常驻 |
| diart（分割+embedding） | ~0.5GB | 常驻 |
| Silero VAD | <50MB | 常驻（CPU 亦可） |
| **总计** | **~5GB** | 余量 7GB |

---

## 2. 后端管道架构

### 2.1 新增 WebSocket 端点 `/meeting`

现有 `/stream` 保持不动（向后兼容）。新增 `/meeting` 端点服务会议录制场景。

```
客户端音频流（WebSocket, 16kHz PCM）
         |
    MeetingSession（会话管理器）
         |
         +-- AudioBuffer（环形缓冲区，持续接收音频）
         |
         +-- SileroVAD
         |     '-- 检测语音段 -> 输出 (start, end, audio_segment)
         |
         +-- DiartSpeakerTracker
         |     '-- 500ms 更新 -> 输出当前 speaker_id
         |     '-- 与注册声纹匹配 -> speaker_name
         |
         +-- ASR Engine（FireRedASR / FunASR 可切换）
         |     '-- 对 VAD 切出的段做转写 -> text
         |
         '-- 合并输出 -> WebSocket 消息
              {type: "utterance", speaker, text, start, end, confidence}
```

### 2.2 会话状态管理

```python
class MeetingSession:
    session_id: str
    start_time: float
    vad: SileroVAD
    speaker_tracker: DiartSpeakerTracker
    asr_engine: ASREngine       # FireRedASR 或 FunASR
    refiner: AIRefiner          # 热词修正
    summarizer: MeetingSummarizer  # 增量摘要
    utterances: list[Utterance] # 所有已转写段
    running_summary: str        # 当前累积摘要
```

### 2.3 WebSocket 消息协议

**客户端 -> 服务端：**

```json
{"action": "start", "engine": "firered", "speakers_enabled": true}
{"action": "audio", "data": "<base64 PCM>"}
{"action": "end"}
```

**服务端 -> 客户端：**

```json
{"type": "utterance", "speaker": "张三", "speaker_id": "spk_001", "text": "这个方案可以", "start": 12.3, "end": 15.8, "confidence": 0.85}
{"type": "utterance_refined", "utterance_id": "utt_007", "text": "这个 LLM 方案可以", "changes": ["LLM"]}
{"type": "speaker_active", "speaker": "李四", "speaker_id": "spk_002"}
{"type": "summary", "content": "讨论了方案可行性...", "decisions": ["采用方案A"], "action_items": [{"assignee": "李四", "task": "评估预算"}]}
{"type": "session_end", "total_utterances": 42, "duration": 1823.5}
```

### 2.4 引擎抽象层

```python
class ASREngine(Protocol):
    def load(self, model_id: str, **kwargs) -> None: ...
    def transcribe(self, audio: np.ndarray, hotwords: str = "") -> TranscribeResult: ...

class TranscribeResult:
    text: str
    language: str
    confidence: float
    duration: float  # 处理耗时
```

FireRedASR 和 FunASR 各自实现此接口，用户可在设置中切换。

### 2.5 VAD 配置

```python
class VADConfig:
    threshold: float = 0.5        # 语音概率阈值
    min_speech_ms: int = 250      # 最小语音段长度
    hangover_ms: int = 300        # 停顿等待时长
    pre_roll_ms: int = 100        # 预缓冲
    max_segment_s: float = 30.0   # 最大段长度（防止一直不停顿）
```

当一段语音超过 `max_segment_s` 仍未停顿时，强制切段（fallback 行为，类似当前 30s 分片）。

### 2.6 新增文件

| 文件 | 职责 |
|------|------|
| `backend/meeting/__init__.py` | 模块入口 |
| `backend/meeting/session.py` | MeetingSession 会话管理 |
| `backend/meeting/vad.py` | Silero VAD 封装 |
| `backend/meeting/speaker_tracker.py` | diart 实时说话人分离封装 |
| `backend/engines/firered_engine.py` | FireRedASR 引擎适配 |
| `server.py` 修改 | 新增 `/meeting` WebSocket 端点 |

---

## 3. 前端录制面板

### 3.1 主窗口新增"录制"Tab

录制时自动切换到此 tab，录制结束后数据保存到历史。

```
+-- 侧边栏 ----------+  +-- 主区域 ----------------------------------+
|  首页               |  |                                            |
|  录制    <-- 新增   |  |  +-- 转写区域（上 70%）------------------+  |
|  设置               |  |  |  [张三] 12:03                        |  |
|                     |  |  |  这个方案我觉得可以，但是...           |  |
|                     |  |  |                                      |  |
|                     |  |  |  [李四] 12:05                        |  |
|                     |  |  |  预算方面需要再评估一下                |  |
|                     |  |  |                                      |  |
|                     |  |  |  [张三] 12:06                        |  |
|                     |  |  |  那技术可行性方面呢？                  |  |
|                     |  |  +--------------------------------------+  |
|                     |  |                                            |
|                     |  |  +-- 摘要卡片（下 30%）------------------+  |
|                     |  |  |  实时摘要                              |  |
|                     |  |  |  * 张三提出方案，李四关注预算           |  |
|                     |  |  |  * 待办：李四评估预算可行性              |  |
|                     |  |  |                          更新于 12:06  |  |
|                     |  |  +--------------------------------------+  |
|                     |  |                                            |
|                     |  |  +-- 控制栏 ------------------------------+  |
|                     |  |  |  录制中 00:03:25  波形  [停止] [暂停]   |  |
|                     |  |  +--------------------------------------+  |
+---------------------+  +--------------------------------------------+
```

### 3.2 Overlay 最小状态指示

录制时 overlay 缩小为单行浮窗：

```
+---------------------------------------+
|  录制中 03:25  [张三] 那技术可行...     |
+---------------------------------------+
```

点击展开回到主窗口录制 tab。

### 3.3 说话人分色

- 每个说话人分配一个颜色（最多 8 色循环）
- 已注册说话人显示姓名
- 未注册说话人显示"说话人 1/2/3"

### 3.4 转写区域交互

- 自动滚动到最新内容
- 手动上翻时暂停自动滚动，出现"回到底部"按钮
- 每段显示：说话人名（分色）+ 时间戳 + 文字
- utterance_refined 到达时平滑更新对应段落文字

### 3.5 新增前端文件

| 文件 | 职责 |
|------|------|
| `frontend/src/components/MeetingRecorder.tsx` | 录制页主组件 |
| `frontend/src/components/meeting/TranscriptPanel.tsx` | 转写显示面板 |
| `frontend/src/components/meeting/SummaryCard.tsx` | 摘要卡片 |
| `frontend/src/components/meeting/RecordingControls.tsx` | 录制控制栏 |
| `frontend/src/components/meeting/MiniOverlay.tsx` | 最小悬浮指示 |
| `frontend/src/lib/meeting-websocket.ts` | `/meeting` WebSocket 客户端 |
| `frontend/src/store/meeting-store.ts` | 录制会话状态管理（Zustand） |

---

## 4. AI 后处理

### 4.1 AI Refiner 改造

**变更点：**

| 维度 | 当前 | 改造后 |
|------|------|--------|
| 触发条件 | 仅英文文本 | 有热词列表即触发 |
| 调用方式 | `claude` CLI text 模式 | 多 provider 抽象 |
| 超时 | 1200s | 30s（单句修正很快） |
| 编码 | 系统默认（GBK 问题） | 强制 UTF-8 |

**Provider 优先级：**

```
1. claude CLI haiku 无头模式（默认）
   claude --model haiku --print -p "<prompt>"
2. Anthropic SDK（预留）
3. 自定义 API（预留国产/小模型）
```

**调用时机：** 每个 utterance 转写完成后异步调用。修正结果通过 `utterance_refined` 消息更新前端。

### 4.2 实时摘要

**工作流：**

```
utterance 持续积累
       |
  每 2-3 分钟触发（可配置）
       |
  输入：running_summary + 新增 utterances
       |
  LLM 生成：更新摘要 + 决策 + 待办
       |
  WebSocket 发送 summary 消息 -> 前端更新摘要卡片
```

**Prompt 结构：**

```
基于之前的摘要和新讨论内容，更新摘要。
之前的摘要：{running_summary}
新内容：
[张三] ...
[李四] ...

请输出：
1. 更新后的摘要（3-5句话）
2. 关键决策（如有）
3. 待办事项（含负责人，如有）
```

**定时触发：** MeetingSession 启动 asyncio task，每 `summary_interval` 秒检查是否有新 utterance，有则触发。

### 4.3 LLM Provider 配置

```json
{
    "llm_provider": "claude_cli",
    "llm_model": "haiku",
    "custom_api_url": "",
    "custom_api_key": "",
    "summary_interval": 120
}
```

### 4.4 新增/修改文件

| 文件 | 职责 |
|------|------|
| `backend/postprocess/ai_refiner.py` | 改造：多 provider + 去英文限制 |
| `backend/meeting/summarizer.py` | 新增：增量摘要器 |
| `frontend/electron/store.ts` | 新增 LLM provider 设置项 |
| `frontend/src/components/settings/LLMSettings.tsx` | 新增：LLM 配置页 |

---

## 5. 输出方式与历史记录

### 5.1 输出格式配置

用户可在设置中选择剪贴板输出格式：

| 格式 | 内容 |
|------|------|
| `text_only` | 纯转写文本 |
| `with_speakers` | `[张三] xxx` 格式 |
| `with_summary` | 带说话人 + 摘要 |
| `full` | 带说话人 + 摘要 + 决策 + 待办 |

完整结构化数据始终保存到历史。

### 5.2 历史记录数据结构

```typescript
interface MeetingRecord {
  id: string;
  timestamp: number;
  duration: number;
  engine: string;

  utterances: Array<{
    speaker: string;
    speaker_id: string;
    text: string;
    start: number;
    end: number;
    confidence: number;
  }>;

  summary: {
    content: string;
    decisions: string[];
    action_items: Array<{
      assignee: string;
      task: string;
    }>;
  } | null;

  plain_text: string;  // 向后兼容
}
```

### 5.3 历史页面增强

- 按说话人筛选
- 关键词搜索
- 摘要/决策/待办面板
- MD 导出（结构化格式）

**MD 导出格式：**

```markdown
# 会议记录 2026-03-08 14:30

## 摘要
讨论了方案可行性...

## 决策
- 采用方案 A

## 待办
- [ ] 李四：评估预算可行性

## 转写记录

**张三** (12:03)
这个方案我觉得可以...

**李四** (12:05)
预算方面需要再评估...
```

### 5.4 数据迁移

旧纯文本历史通过迁移逻辑转为 `MeetingRecord`：`utterances` 为空，`plain_text` 填充原文本，`summary` 为 null。

### 5.5 新增/修改文件

| 文件 | 职责 |
|------|------|
| `frontend/src/store/meeting-store.ts` | MeetingRecord 类型和持久化 |
| `frontend/src/components/history/MeetingHistoryDetail.tsx` | 结构化历史详情页 |
| `frontend/src/components/history/SpeakerFilter.tsx` | 说话人筛选组件 |
| `frontend/src/components/settings/OutputSettings.tsx` | 输出格式配置 |
| `frontend/src/lib/export-meeting.ts` | 结构化 MD 导出 |
| `frontend/src/store/app-store.ts` | 迁移逻辑 |

---

## 6. 实施阶段

### Phase 1：后端管道（P0）

搭建 Silero VAD + FireRedASR + diart + `/meeting` 端点，可通过 WebSocket 客户端测试。

**验收标准：**
- `/meeting` WebSocket 连接成功
- 发送音频数据，收到带说话人标签的 utterance 消息
- 已注册说话人正确匹配姓名
- FireRedASR 和 FunASR 可通过参数切换

### Phase 2：前端录制面板（P0）

主窗口录制 tab + 最小 overlay + WebSocket 对接。

**验收标准：**
- 录制时自动切换到录制 tab
- 转写结果按说话人分色实时显示
- 自动滚动 + 手动上翻暂停
- overlay 显示最小录制状态

### Phase 3：AI 后处理（P1）

Refiner 改造 + 实时摘要 + LLM 设置页。

**验收标准：**
- 热词修正对中英文均生效
- 摘要卡片每 2-3 分钟更新
- LLM provider 可在设置中配置

### Phase 4：输出与历史（P1）

输出格式配置 + 结构化历史 + 增强历史页面。

**验收标准：**
- 四种输出格式正确生成
- 历史记录保存完整结构化数据
- 按说话人筛选和搜索正常工作
- MD 导出格式正确
- 旧历史数据迁移不丢失

---

## 7. 依赖清单

### Python 新增依赖

```
fireredasr          # FireRedASR ASR 引擎
diart               # 实时说话人分离
silero-vad          # 语音活动检测（或通过 torch.hub）
pyannote.audio      # 说话人分割和 embedding 模型
```

### 模型下载

| 模型 | 来源 | 大小 |
|------|------|------|
| FireRedASR-AED-L | HuggingFace `FireRedTeam/FireRedASR-AED-L` | ~4GB |
| pyannote/segmentation-3.0 | HuggingFace（需 accept license） | ~50MB |
| pyannote/embedding | HuggingFace | ~80MB |
| Silero VAD | torch.hub / GitHub | ~2MB |

### 前端无新增外部依赖

仅新增组件和状态管理，使用现有技术栈（React + Zustand + Electron）。
