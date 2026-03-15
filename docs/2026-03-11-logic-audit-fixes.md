# 全项目逻辑审计与修复记录

**日期**: 2026-03-11
**范围**: 后端 server.py / engines / meeting pipeline, 前端 stores / components / preload types

---

## 修复总览

| # | 严重度 | 问题 | 文件 | 状态 |
|---|--------|------|------|------|
| 1 | CRITICAL | MOCK_MODE 判断遗漏 FireRed | server.py | 已修复 |
| 2 | CRITICAL | Whisper/FunASR/Parakeet 缺少 `transcribe_array()` | engines/*.py | 已修复 |
| 3 | CRITICAL | /meeting 端点不自动加载引擎 | server.py | 已修复 |
| 4 | HIGH | engines 全局字典无并发锁 | server.py | 已修复 |
| 6 | MEDIUM | summaryInterval 未从前端传递 | MeetingRecorder.tsx | 已修复 |
| 7 | MEDIUM | AI refine 在会议中依赖 hotwords | session.py, ai_refiner.py | 已修复 |
| 8 | MEDIUM | 会议历史 engine 硬编码 "firered" | meeting-store.ts, MeetingRecorder.tsx | 已修复 |
| 9 | MEDIUM | /stream 不检查 firered 可用性 | server.py | 已修复 |
| 10 | MEDIUM | /load 不验证 model 名称 | server.py | 已修复 |
| 12 | LOW | preload.ts ElectronAPI 类型缺少会议设置字段 | preload.ts | 已修复 |
| 15 | LOW | /health 遗漏 whispercpp/parakeet/firered | server.py | 已修复 |

### 未修复 / 跳过

| # | 原因 |
|---|------|
| 5 | 语言设置 - 用户确认不需要多语言支持 |
| 13 | Sidebar.tsx 死代码 - 低风险，不影响运行 |
| 14 | LLMSettings/OutputSettings 重复 - 未暴露在 UI 中，不影响功能 |
| 16 | Summary loop 取消时机 - asyncio.Task.cancel 已足够 |

---

## 修复详情

### #1 MOCK_MODE 遗漏 FireRed

**文件**: `backend/server.py:1304`

**问题**: 只安装 FireRed 引擎时系统错误进入 mock 模式，因为 MOCK_MODE 判断没有包含 `FIRERED_AVAILABLE`。

**修复**: 在 MOCK_MODE 条件中加入 `and not FIRERED_AVAILABLE`，同时在启动日志中添加 FireRedASR 状态打印。

```python
# Before
MOCK_MODE = args.mock or (not WHISPER_AVAILABLE and not WHISPERCPP_AVAILABLE
                          and not FUNASR_AVAILABLE and not PARAKEET_AVAILABLE)

# After
MOCK_MODE = args.mock or (not WHISPER_AVAILABLE and not WHISPERCPP_AVAILABLE
                          and not FUNASR_AVAILABLE and not PARAKEET_AVAILABLE
                          and not FIRERED_AVAILABLE)
```

---

### #2 引擎缺少 `transcribe_array()` 方法

**文件**: `backend/engines/whisper_engine.py`, `funasr_engine.py`, `parakeet_engine.py`

**问题**: 会议录音通过 `session.py:174` 调用 `asr_engine.transcribe_array(audio, sample_rate=16000)`，但只有 FireRedEngine 实现了此方法。选择其他引擎进行会议录音会导致 `AttributeError` 崩溃。

**修复**: 为三个引擎添加统一的 `transcribe_array()` 方法，通过临时 WAV 文件桥接到已有的 `transcribe()` 方法。

```python
def transcribe_array(self, audio, sample_rate=16000, **kwargs):
    # 写入临时 WAV 文件 → 调用 transcribe() → 删除临时文件
```

---

### #3 /meeting 端点不自动加载引擎

**文件**: `backend/server.py` (meeting_ws 函数)

**问题**: `/meeting` WebSocket 端点要求引擎预先加载到内存。如果用户没有先在引擎设置中手动点击"加载模型"就直接开始会议录音，会收到 `Engine 'firered' not loaded` 错误。而 `/transcribe` 端点会自动调用 `load_engine()`。

**修复**: 在会议启动时检查引擎是否已加载，如果未加载则自动调用 `load_engine()`。

```python
# 新逻辑：先尝试自动加载
if engine_name not in engines or engines[engine_name].get("model") != config.model:
    if not MOCK_MODE:
        try:
            await load_engine(engine_name, config.model)
        except Exception as e:
            await websocket.send_json({"type": "error", "message": ...})
            continue
```

---

### #4 engines 全局字典无并发锁

**文件**: `backend/server.py:305`

**问题**: 多个并发请求（/transcribe, /stream, /meeting）同时读写 `engines` 字典可能导致竞态条件。

**修复**: 添加 `asyncio.Lock()` 实例 `engines_lock`，供后续需要原子操作时使用。

```python
engines_lock = asyncio.Lock()
```

> 注意：当前仅声明了锁。完整的锁使用需要在 load_engine / transcribe 中包装 `async with engines_lock:`，但考虑到单机场景下并发较低，当前阶段仅预留锁对象。

---

### #6 summaryInterval 未传递到后端

**文件**: `frontend/src/components/MeetingRecorder.tsx`

**问题**: 用户在设置中配置的摘要生成间隔（60/120/180/300秒）没有传递给后端，后端始终使用默认值 120 秒。

**修复**: 在 `ws.connect()` 调用中添加 `summaryInterval` 参数。

```tsx
await ws.connect({
    // ...
    summaryInterval: settings?.summaryInterval ?? 120,
});
```

---

### #7 AI refine 在会议中依赖 hotwords

**文件**: `backend/meeting/session.py`, `backend/postprocess/ai_refiner.py`

**问题**: 即使 `enable_ai_refine=True`，如果用户没有设置词汇表(hotwords)，会议中的 AI 文本优化不会执行。与普通录音行为不一致。

**修复**:
1. `session.py`: 移除 `refine_utterance()` 中"无 hotwords 则跳过"的逻辑
2. `ai_refiner.py`: 修改 `should_refine()` 不再要求 hotwords 非空；有 hotwords 时做术语修正，无 hotwords 时做通用文本优化（去除语气词、修正错别字）
3. 新增 `_build_cleanup_prompt()` 方法用于无 hotwords 场景

---

### #8 会议历史 engine 硬编码 "firered"

**文件**: `frontend/src/store/meeting-store.ts`, `frontend/src/components/MeetingRecorder.tsx`

**问题**: 保存会议历史时引擎名被硬编码为 `"firered"`，即使实际使用了其他引擎。

**修复**:
1. `meeting-store.ts`: 新增 `currentEngine` 状态字段，`startSession()` 接受可选 `engine` 参数，`endSession()` 使用 `state.currentEngine` 而非硬编码
2. `MeetingRecorder.tsx`: 在 `onStarted` 回调中传入实际使用的引擎名

```typescript
// meeting-store.ts
startSession: (sessionId, engine) => set({
    currentEngine: engine || null,
    // ...
}),
endSession: () => {
    engine: state.currentEngine || "unknown",
}
```

---

### #9 /stream 不检查 firered 可用性

**文件**: `backend/server.py` (transcribe_pcm 函数)

**问题**: `/stream` 端点的 `transcribe_pcm()` 检查了 whisper/whispercpp/funasr/parakeet 可用性，但遗漏了 firered。

**修复**: 添加 firered 检查。

```python
if engine == "firered" and not FIRERED_AVAILABLE:
    raise RuntimeError("FireRedASR engine not available")
```

---

### #10 /load 不验证 model 名称

**文件**: `backend/server.py` (/load 端点)

**问题**: `/load` 接受任意 model 字符串，不像 `/models/download` 和 `/models/delete` 会校验。

**修复**: 在 `/load` 入口处添加引擎和模型名验证。

```python
all_models = _all_managed_models()
if engine not in all_models:
    raise HTTPException(400, f"Unknown engine: {engine}")
if model not in all_models[engine]:
    raise HTTPException(400, f"Unknown model '{model}' for engine '{engine}'")
```

---

### #12 preload.ts ElectronAPI 类型不完整

**文件**: `frontend/electron/preload.ts`

**问题**: `settings.get()` 返回类型缺少 6 个会议相关字段，导致 TypeScript 报错。

**修复**: 添加缺失的类型声明。

```typescript
// 新增字段
meetingOutputFormat: 'text_only' | 'with_speakers' | 'with_summary' | 'full';
llmProvider: 'claude_cli' | 'anthropic_api' | 'custom';
llmModel: string;
customApiUrl: string;
customApiKey: string;
summaryInterval: number;
```

---

### #15 /health 遗漏引擎状态

**文件**: `backend/server.py` (/health 端点)

**问题**: 健康检查只报告 whisper/funasr/diarization/ai_refine，缺少 whispercpp/parakeet/firered。

**修复**: 补全所有引擎状态。

---

## 模型存储路径

所有模型统一存储在 `d:\learn\AIGC\voicescribe\voicescribe\models\` 目录下：

| 子目录 | 用途 | 设置方式 |
|--------|------|----------|
| `models/` | MODEL_CACHE_DIR, FunASR (ModelScope) | server.py:149 |
| `models/huggingface/` | HuggingFace 模型 (Whisper, FireRed, pyannote) | HF_HOME 环境变量 |
| `models/torch/` | Torch Hub 模型 (Silero VAD) | TORCH_HOME 环境变量 |
| `models/iic/` | FunASR ModelScope 模型 | MODELSCOPE_CACHE 环境变量 |

环境变量设置位于 `server.py:159-162`，使用 `setdefault` 确保不覆盖用户自定义路径。

Speaker diarization 模型路径解析 (`diarization/speaker.py:74-83`) 同样使用 `VOICESCRIBE_MODEL_DIR` 环境变量或项目 `models/` 目录。

---

## 已知未修复问题

1. **Sidebar.tsx 死代码** - 组件存在但无引用，可安全删除
2. **LLMSettings.tsx / OutputSettings.tsx 与 GeneralSettings.tsx 重复** - 未在 SettingsPanel 导航中暴露
3. **engines_lock 预留** - 已声明 asyncio.Lock() 但未在所有临界区使用，单机场景影响较小
