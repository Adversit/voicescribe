# VoiceScribe 统一录制架构重设计

> 2026-03-11

## 核心理念

**只有一种录制行为，设置决定体验深度。**

会议纪要 = 较长的录制 + 实时展示。快速输入 = 较短的录制。
不再区分"快捷键速记"和"会议录制"，统一为一个录制流程。

---

## 现状问题

```
当前：两条独立管线，三个端点
                                          ┌─ /stream ──→ 30s 分块流式文字
  快捷键 → GlobalRecordingManager ───────┤
                                          └─ /transcribe → 文件上传（非流式）

  手动按钮 → MeetingRecorder → /meeting ──→ VAD → 说话人 → ASR → AI → 摘要
```

| 问题 | 具体表现 |
|------|---------|
| 双管线冲突 | 两套 WebSocket 端点、两套录音逻辑、两套历史存储 |
| 引擎不统一 | 快捷键用 settings.engine，会议硬编码可能不同 |
| 设置割裂 | "流式传输"和"会议录制"概念混淆，用户不知道开哪个 |
| 历史割裂 | app-store 存快捷键历史，meeting-store 存会议历史，两个地方看 |
| 会议历史丢失 | finish() 不等后端响应，WebSocket 关闭后 session_end 收不到 |
| 说话人失败 | pyannote/diart 依赖版本不兼容（use_auth_token、set_audio_backend） |
| /stream 鸡肋 | 30s 分块粗粒度流式，不如 /meeting 的 VAD 逐句流式 |

---

## 统一后设计

```
统一后：一条管线，两个端点，设置控制深度

                      ┌─ 流式关闭 → /transcribe (POST) ──→ 最终文字 ───┐
  快捷键触发录制 ─────┤                                                  ├→ 统一历史
                      └─ 流式开启 → /stream (WebSocket) ──→ 逐句文字 ──┘
                                                              ↓
                                                    "实时转录" 面板显示
```

### 端点命名变更

| 旧端点 | 新端点 | 说明 |
|--------|--------|------|
| `WS /stream` | **删除** | 30s 分块粗粒度流式，功能被新 /stream 完全覆盖 |
| `WS /meeting` | → `WS /stream` | 改名。它不只是会议，而是通用的流式转录通道 |
| `POST /transcribe` | 不变 | 非流式，录完整段上传 |

### 前端命名变更

| 旧名 | 新名 | 说明 |
|------|------|------|
| `meeting-websocket.ts` | → `stream-websocket.ts` | 文件名与端点一致 |
| `MeetingWebSocket` | → `StreamWebSocket` | 类名与端点一致 |
| `MeetingWSOptions` | → `StreamWSOptions` | 类型名一致 |
| `MeetingWSCallbacks` | → `StreamWSCallbacks` | 类型名一致 |
| `meeting-store.ts` | → 合并入 `recording-store.ts` | 统一存储 |
| `MeetingRecorder.tsx` | → 删除 | 逻辑合并入 GlobalRecordingManager |
| `stream-transcriber.ts` | → 删除 | 旧 /stream 客户端，不再需要 |
| 侧边栏 "录制" tab | → "实时转录" | UI 标签 |

---

## 前后端接口对齐

### 端点 1：`POST /transcribe`（非流式）

**使用场景：** 流式关闭时，录音结束后整段上传。

```
前端                              后端
──────                            ──────
录音结束 → 上传 WAV 文件 ───────→ ASR 转录
                              ←── 返回 JSON
```

**请求参数（multipart form）：**

| 参数 | 类型 | 说明 |
|------|------|------|
| file | File | WAV 音频文件 |
| engine | string | ASR 引擎名 |
| model | string | 模型名 |
| language | string | zh/en/ja/auto |
| hotwords | string | 逗号分隔热词 |
| enable_ai_refine | bool | 是否 AI 润色 |
| enable_diarization | bool | 是否说话人识别 |

**响应 JSON：**

```json
{
  "text": "转录文本",
  "segments": [{"start": 0.0, "end": 1.5, "text": "..."}],
  "duration": 5.2,
  "engine": "firered",
  "model": "firered-aed-l"
}
```

### 端点 2：`WebSocket /stream`（流式，原 /meeting）

**使用场景：** 流式开启时，实时逐句转录。

```
前端                              后端
──────                            ──────
连接 WebSocket /stream ─────────→ 接受连接

发送 {"action":"start", ...} ───→ 初始化 session
                              ←── {"type":"started", "session_id":"..."}

发送 PCM16 binary chunks ──────→ VAD → 说话人 → ASR
                              ←── {"type":"utterance", ...}        // 逐句
                              ←── {"type":"speaker_active", ...}   // 说话人切换
                              ←── {"type":"utterance_refined",...}  // AI 润色后
                              ←── {"type":"summary", ...}          // 定时摘要

发送 {"action":"end"} ─────────→ 结束 session
                              ←── {"type":"session_end", "session_data":{...}}
                                   WebSocket 关闭
```

**start 消息参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| action | "start" | 固定值 |
| engine | string | ASR 引擎名（从统一设置读取） |
| model | string | 模型名 |
| speakers_enabled | bool | 是否说话人识别 |
| hotwords | string | 逗号分隔热词 |
| enable_ai_refine | bool | 是否 AI 润色 |
| summary_interval | number | 摘要间隔秒数 |
| llm_provider | string | LLM 提供商 |
| llm_model | string | LLM 模型名 |

**服务端推送消息类型：**

| type | 字段 | 对应前端 Store 操作 | 对应 UI |
|------|------|---------------------|---------|
| `started` | session_id, engine | `startSession()` | "实时转录"面板显示录制中 |
| `utterance` | id, speaker, speaker_id, text, start, end, confidence | `addUtterance()` | TranscriptPanel 追加一行 |
| `utterance_refined` | utterance_id, text | `updateUtterance()` | TranscriptPanel 更新该行文字 |
| `speaker_active` | speaker, speaker_id | `setActiveSpeaker()` | 显示当前说话人 |
| `summary` | content, decisions, action_items | `setSummary()` | SummaryCard 更新 |
| `session_end` | total_utterances, duration, session_data | `endSession()` → 保存到 history | "实时转录"面板显示结束 |
| `error` | message | 显示错误提示 | Toast / 错误提示 |

---

## 前端改动

### 1. 侧边栏 Tab 重命名

```
之前：录制 | 通用 | 引擎 | 词汇 | 说话人 | 快捷键 | 历史记录
之后：实时转录 | 通用 | 引擎 | 词汇 | 说话人 | 快捷键 | 历史记录
```

- "实时转录" tab：显示 TranscriptPanel + SummaryCard
- 无需手动开始/停止按钮（热键控制录制）
- 流式未开启时显示空状态："开启流式传输后，录制内容将在此实时显示"
- 录制中时自动切换到此 tab

### 2. 合并 Store → 统一 `recording-store.ts`

```typescript
// 合并 app-store 和 meeting-store 为一个 store
interface RecordingRecord {
  id: string;
  timestamp: number;          // 录制开始时间
  duration: number;           // 秒
  engine: string;
  model: string;
  language: string;
  text: string;               // 纯文本（所有录制都有）
  segments: Segment[];        // 时间戳片段（非流式有）
  utterances?: Utterance[];   // 逐句记录（流式 + 说话人时有）
  summary?: Summary;          // 摘要（流式 + AI 时有）
  isStreaming: boolean;        // 标记录制方式
}

interface RecordingState {
  // ---- 运行时状态（不持久化） ----
  isRecording: boolean;
  sessionId: string | null;
  currentEngine: string | null;
  currentUtterances: Utterance[];   // 流式时实时更新
  currentSummary: Summary | null;
  activeSpeaker: string | null;
  recordingStartTime: number | null;

  // ---- 持久化 ----
  history: RecordingRecord[];       // 统一历史
}
```

### 3. 重命名 + 合并录制逻辑

`MeetingWebSocket` → `StreamWebSocket`，连接 `/stream`（原 `/meeting`）：

```
GlobalRecordingManager (唯一录制入口)
├── 监听 Electron IPC: start-audio-recording / stop-audio-recording
├── 读取 settings.enableStreaming
│
├── 流式关闭：
│   ├── 启动 WavRecorder 录音
│   ├── 停止时 → 上传到 POST /transcribe
│   ├── 收到结果 → addToHistory(非流式记录)
│   └── 输出到剪贴板/光标
│
└── 流式开启：
    ├── 创建 StreamWebSocket → 连接 WS /stream
    ├── 启动 WavRecorder → PCM chunks → ws.sendAudio()
    ├── 收到 utterance → store.addUtterance() → "实时转录"面板更新
    ├── 收到 summary → store.setSummary() → SummaryCard 更新
    ├── 停止时 → ws.finish() → 等待 session_end
    ├── 收到 session_end → addToHistory(流式记录)
    └── 输出到剪贴板/光标
```

### 4. 统一历史记录页

历史记录页展示所有 `RecordingRecord`：
- 非流式记录：显示文字、时长、引擎
- 流式记录：额外显示说话人、摘要、待办，支持说话人筛选和 MD 导出

### 5. 修复 finish() 等待 session_end

```typescript
// stream-websocket.ts: finish() 改为等待 session_end 响应
async finish(): Promise<SessionEndData> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("timeout")), 10000);
    this.pendingFinish = { resolve, reject, timeout };
    this.ws.send(JSON.stringify({ action: "end" }));
  });
}
```

---

## 后端改动

### 6. 端点改名：`/meeting` → `/stream`

```python
# server.py
# 旧：
@app.websocket("/meeting")
async def meeting_ws(websocket: WebSocket):

# 新：
@app.websocket("/stream")
async def stream_ws(websocket: WebSocket):
```

- 函数名 `meeting_ws` → `stream_ws`
- 删除旧的 `/stream` 端点（30s 分块版本）
- 端点内部逻辑（VAD → 说话人 → ASR → AI → 摘要）不变

### 7. 修复说话人识别依赖

```python
# speaker_tracker.py:164 - 修复 pyannote 新版 API
# 旧：Inference("pyannote/embedding", use_auth_token=True)
# 新：Inference("pyannote/embedding")
#     或使用 HF_TOKEN 环境变量

# speaker_tracker.py:53 - 修复 diart + torchaudio 兼容
# torchaudio 2.0+ 移除了 set_audio_backend
# 需要在 import diart 前 patch 或捕获异常
```

### 8. `/stream` 端点增强（确保可靠关闭）

- `session_end` 消息在 `websocket.close()` 之前发送（确认无 race condition）
- `WebSocketDisconnect` 异常处理中也返回 session 数据（优雅降级）

---

## 完整命名对照表

确保端点、文件名、类名、UI 标签全链路一致：

| 层 | 旧名 | 新名 |
|----|------|------|
| **后端端点** | `WS /meeting` | `WS /stream` |
| **后端端点** | `WS /stream`（旧 30s 版） | 删除 |
| **后端函数** | `meeting_ws()` | `stream_ws()` |
| **后端 session** | `meeting/session.py` 内部不变 | 不变（MeetingSession 可后续改名） |
| **前端文件** | `meeting-websocket.ts` | `stream-websocket.ts` |
| **前端类** | `MeetingWebSocket` | `StreamWebSocket` |
| **前端类型** | `MeetingWSOptions` | `StreamWSOptions` |
| **前端类型** | `MeetingWSCallbacks` | `StreamWSCallbacks` |
| **前端文件** | `stream-transcriber.ts` | 删除 |
| **前端文件** | `MeetingRecorder.tsx` | 删除（合并入 GlobalRecordingManager） |
| **前端 store** | `app-store.ts` + `meeting-store.ts` | `recording-store.ts` |
| **UI 标签** | "录制" | "实时转录" |
| **设置描述** | "流式传输" → 连接 `/meeting` | "流式传输" → 连接 `/stream` |

---

## 设置项整理（统一后）

| 分类 | 设置项 | 说明 |
|------|--------|------|
| **通用** | 语言 | 中/英/日/自动 |
| | 输出方式 | 剪贴板 / 直接输入 / 两者 |
| | 流式传输 | 开：实时逐句显示（WS /stream）；关：录完再出结果（POST /transcribe） |
| | 说话人识别 | 开：标注说话人（需流式） |
| | AI 文本优化 | 开：去语气词、修错别字 |
| | 输出格式 | 纯文本 / 带说话人 / 带摘要 / 完整 |
| **引擎** | ASR 引擎 + 模型 | 统一，所有录制共用 |
| **词汇** | 热词表 | 提升专有名词识别 |
| **说话人** | 声纹注册/管理 | 用于说话人识别 |
| **快捷键** | 全局热键 | 触发录制 |
| **AI 模型** | LLM 提供商 / 模型 / 摘要间隔 | 用于 AI 优化和摘要 |
| **历史** | 统一历史列表 | 所有录制记录 |

### 设置联动逻辑

```
流式关闭 → 说话人识别禁用（灰显）
           摘要间隔禁用（灰显）
           输出格式只能选"纯文本"

流式开启 → 解锁说话人识别、AI 优化
           解锁输出格式选择

AI 优化关闭 → "带摘要"和"完整"格式禁用
说话人关闭 → "带说话人"和"完整"格式禁用
```

---

## 前端 UI ↔ 后端接口 ↔ Store 映射表

完整对照，确保三者一致：

| 用户操作 | 前端 UI | 后端端点 | Store 操作 |
|---------|---------|---------|-----------|
| 按下热键开始录音 | 浮窗显示波形 | - | `isRecording = true` |
| (流式) 连接成功 | "实时转录"面板显示录制中 | `WS /stream` 推 `started` | `startSession()` |
| (流式) 录音中 | "实时转录"面板逐句更新 | `WS /stream` 推 `utterance` | `addUtterance()` |
| (流式) AI 润色完成 | 该行文字更新 | `WS /stream` 推 `utterance_refined` | `updateUtterance()` |
| (流式) 说话人切换 | 显示当前说话人 | `WS /stream` 推 `speaker_active` | `setActiveSpeaker()` |
| (流式) 定时摘要 | SummaryCard 更新 | `WS /stream` 推 `summary` | `setSummary()` |
| 松开热键停止录音 | 浮窗消失 | `WS /stream` 推 `session_end` | `endSession()` → 保存 history |
| (非流式) 停止录音 | 浮窗显示"转录中" | `POST /transcribe` 返回 JSON | `addToHistory()` |
| 查看历史 | "历史记录" tab | - | 读 `history[]` |
| 导出 Markdown | 历史详情页导出按钮 | - | 读 `history[i]` 生成 MD |

---

## 实施顺序

1. **后端：删除旧 `/stream`，将 `/meeting` 改名为 `/stream`**
2. **后端：修复说话人识别 bug**（pyannote/diart 兼容性）
3. **前端：`meeting-websocket.ts` → `stream-websocket.ts`**（重命名 + 改连接地址）
4. **前端：合并 Store**（app-store + meeting-store → recording-store）
5. **前端：合并录制逻辑**（GlobalRecordingManager 吸收 MeetingRecorder）
6. **前端：重命名 Tab**（录制 → 实时转录）+ 空状态提示
7. **前端：修复 finish() 等待 session_end**（确保历史可靠保存）
8. **前端：统一历史页面**
9. **清理废弃代码**（删除 MeetingRecorder、旧 store、stream-transcriber）

---

## 不变的部分

- 后端 ASR 引擎代码不动
- 后端 `/transcribe` 端点不动
- 后端 `/stream`（原 `/meeting`）内部流水线逻辑不动（VAD → 说话人 → ASR → AI → 摘要）
- 后端 `meeting/` 目录下的 session.py、vad.py、summarizer.py、speaker_tracker.py 内部逻辑不动
- 前端 UI 组件（TranscriptPanel、SummaryCard）复用
- Electron 主进程的热键和浮窗逻辑不动
- 设置持久化机制（electron/store.ts）不动
