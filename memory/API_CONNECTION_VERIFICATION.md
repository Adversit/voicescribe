# API 连接验证报告

## 验证日期
2026-02-10

## 验证结果：✅ 全部正常连接

---

## 1. 说话人识别功能

### 前端实现 (SpeakerSettings.tsx)

#### ✅ 获取说话人列表
```typescript
const backendSpeakers = await window.electron.backend.getSpeakers();
```
- **调用**: `window.electron.backend.getSpeakers()`
- **IPC**: `get-speakers` → `ipcMain.handle('get-speakers')`
- **后端API**: `GET /speakers`

#### ✅ 注册新说话人
```typescript
const result = await window.electron.backend.registerSpeaker(newSpeakerName, arrayBuffer);
```
- **调用**: `window.electron.backend.registerSpeaker(name, audioBuffer)`
- **IPC**: `register-speaker` → `ipcMain.handle('register-speaker')`
- **后端API**: `POST /speakers/register`
- **参数**: 
  - `name`: 说话人姓名
  - `audio`: 音频文件 (WebM 格式)

#### ✅ 删除说话人
```typescript
await window.electron.backend.deleteSpeaker(id);
```
- **调用**: `window.electron.backend.deleteSpeaker(speakerId)`
- **IPC**: `delete-speaker` → `ipcMain.handle('delete-speaker')`
- **后端API**: `DELETE /speakers/{speaker_id}`

### 后端实现 (server.py)

#### ✅ API 端点存在
- **Line 731**: `@app.get("/speakers")` - 列出说话人
- **Line 700**: `@app.post("/speakers/register")` - 注册说话人
- **Line 750**: `@app.delete("/speakers/{speaker_id}")` - 删除说话人

#### ✅ 转录时使用说话人识别
- **Line 511**: `enable_diarization: bool = Form(False)` - 接收参数
- **Line 554**: 根据 `enable_diarization` 加载引擎
- **Line 572**: `if engine == "funasr" and enable_diarization:` - FunASR 内置说话人识别
- **Line 595**: `if enable_diarization and DIARIZATION_AVAILABLE` - 使用独立说话人识别模块

---

## 2. 词汇功能

### 前端实现 (VocabularySettings.tsx)

#### ✅ 加载词汇列表
```typescript
const settings = await window.electron.settings.get();
setHotwords(settings.vocabulary || []);
```
- **调用**: `window.electron.settings.get()`
- **IPC**: `get-settings` → `ipcMain.handle('get-settings')`
- **存储**: Electron Store (本地持久化)

#### ✅ 保存词汇列表
```typescript
window.electron.settings.update({ vocabulary: words });
```
- **调用**: `window.electron.settings.update({ vocabulary })`
- **IPC**: `update-settings` → `ipcMain.handle('update-settings')`
- **存储**: Electron Store (本地持久化)

### 后端实现 (server.py)

#### ✅ 转录时使用词汇
- **Line 512**: `hotwords: str = Form("")` - 接收参数
- **Line 563**: `if engine == "funasr" and hotwords:` - FunASR 使用 hotwords
- **Line 565**: `result = eng.transcribe(tmp_path, language=language, hotwords=hotwords)` - 传递给引擎
- **Line 606**: AI 精炼时也使用 hotwords
  ```python
  hotwords_list = [w.strip() for w in hotwords.split(",") if w.strip()]
  result["text"] = refiner.refine(result["text"], hotwords_list)
  ```

---

## 3. 转录流程中的参数传递

### 前端 → 主进程 (main.ts)

#### ✅ transcribeAudioFile() 函数
```typescript
const settings = getSettings();
const result = await backend.transcribe(audioPath, {
    engine: settings.engine,
    model: settings.model,
    language: settings.language,
    enableDiarization: settings.enableDiarization,  // ✅ 说话人识别
    hotwords: settings.vocabulary.join(','),         // ✅ 词汇列表
    enableAiRefine: settings.enableAiRefine,
});
```

**位置**: `frontend/electron/main.ts` (Line ~600)

### 主进程 → 后端 (backend.ts)

#### ✅ transcribe() 函数
```typescript
export async function transcribe(
    audioPath: string,
    options: TranscribeOptions = {}
): Promise<TranscribeResult> {
    const formData = new FormData();
    formData.append('audio', fs.createReadStream(audioPath));
    formData.append('engine', options.engine || 'funasr');
    formData.append('model', options.model || 'seaco-paraformer');
    formData.append('language', options.language || 'zh');
    formData.append('enable_diarization', String(options.enableDiarization || false));  // ✅
    formData.append('hotwords', options.hotwords || '');                                 // ✅
    formData.append('enable_ai_refine', String(options.enableAiRefine || false));

    return request<TranscribeResult>('POST', '/transcribe', formData, 300000);
}
```

**位置**: `frontend/electron/backend.ts` (Line ~130)

### 后端接收 (server.py)

#### ✅ /transcribe 端点
```python
@app.post("/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(...),
    engine: str = Form("funasr"),
    model: str = Form("large-v3"),
    language: str = Form("zh"),
    enable_diarization: bool = Form(False),  # ✅ 接收说话人识别参数
    hotwords: str = Form(""),                # ✅ 接收词汇参数
    enable_ai_refine: bool = Form(False),
) -> TranscribeResult:
```

**位置**: `backend/server.py` (Line 508-515)

---

## 4. 完整数据流

### 说话人识别流程

```
用户界面 (SpeakerSettings.tsx)
    ↓ 启用说话人识别开关
设置存储 (Electron Store)
    ↓ settings.enableDiarization = true
录音转录 (main.ts)
    ↓ getSettings() → enableDiarization: true
后端API调用 (backend.ts)
    ↓ formData.append('enable_diarization', 'true')
后端处理 (server.py)
    ↓ enable_diarization: bool = Form(False)
引擎加载 (FunASREngine)
    ↓ eng.load(model, enable_diarization=True)
转录结果
    ↓ segments 包含 speaker 字段
历史记录
    ↓ 显示说话人标签
```

### 词汇功能流程

```
用户界面 (VocabularySettings.tsx)
    ↓ 添加词汇: ["张三", "李四", "VoiceScribe"]
设置存储 (Electron Store)
    ↓ settings.vocabulary = ["张三", "李四", "VoiceScribe"]
录音转录 (main.ts)
    ↓ getSettings() → vocabulary: ["张三", "李四", "VoiceScribe"]
    ↓ hotwords: settings.vocabulary.join(',')
后端API调用 (backend.ts)
    ↓ formData.append('hotwords', '张三,李四,VoiceScribe')
后端处理 (server.py)
    ↓ hotwords: str = Form("")
FunASR引擎
    ↓ eng.transcribe(path, language, hotwords='张三,李四,VoiceScribe')
AI精炼 (可选)
    ↓ refiner.refine(text, ['张三', '李四', 'VoiceScribe'])
转录结果
    ↓ 专有名词识别准确率提高
```

---

## 5. 验证方法

### 测试说话人识别

1. **注册说话人**:
   - 打开 "说话人管理" 设置
   - 输入姓名，点击 "录制声纹"
   - 录制 5-10 秒语音
   - 检查是否出现在列表中

2. **启用说话人识别**:
   - 打开 "引擎设置"
   - 启用 "说话人识别" 开关

3. **测试转录**:
   - 按 Alt+B 录音
   - 多人对话
   - 查看历史记录中的分段是否有说话人标签

### 测试词汇功能

1. **添加词汇**:
   - 打开 "自定义词汇" 设置
   - 添加专有名词 (如: "VoiceScribe", "张三", "李四")

2. **测试转录**:
   - 按 Alt+B 录音
   - 说出添加的专有名词
   - 检查转录结果是否正确识别

3. **验证参数传递**:
   - 打开 F12 控制台
   - 查看后端日志: `[Transcribe] FunASR with hotwords: 张三,李四,VoiceScribe`

---

## 6. 代码位置总结

### 前端组件
- **说话人设置**: `frontend/src/components/settings/SpeakerSettings.tsx`
- **词汇设置**: `frontend/src/components/settings/VocabularySettings.tsx`

### IPC 通信
- **Preload**: `frontend/electron/preload.ts`
  - `window.electron.backend.getSpeakers()`
  - `window.electron.backend.registerSpeaker()`
  - `window.electron.backend.deleteSpeaker()`
  - `window.electron.settings.get()`
  - `window.electron.settings.update()`

### 主进程
- **IPC Handlers**: `frontend/electron/main.ts`
  - `ipcMain.handle('get-speakers')`
  - `ipcMain.handle('register-speaker')`
  - `ipcMain.handle('delete-speaker')`
  - `ipcMain.handle('get-settings')`
  - `ipcMain.handle('update-settings')`
- **转录调用**: `transcribeAudioFile()` 函数

### 后端 API 客户端
- **API 调用**: `frontend/electron/backend.ts`
  - `getSpeakers()`
  - `registerSpeaker()`
  - `deleteSpeaker()`
  - `transcribe()` - 包含 `enableDiarization` 和 `hotwords` 参数

### 后端服务器
- **API 端点**: `backend/server.py`
  - `GET /speakers` (Line 731)
  - `POST /speakers/register` (Line 700)
  - `DELETE /speakers/{speaker_id}` (Line 750)
  - `POST /transcribe` (Line 508) - 接收 `enable_diarization` 和 `hotwords`

---

## 7. 结论

✅ **说话人识别功能**: 完全连接到后端API
- 前端可以注册、列出、删除说话人
- 转录时正确传递 `enable_diarization` 参数
- 后端正确处理说话人识别

✅ **词汇功能**: 完全连接到后端API
- 前端可以添加、删除、管理词汇
- 转录时正确传递 `hotwords` 参数 (逗号分隔)
- 后端正确传递给 FunASR 引擎和 AI 精炼模块

✅ **数据流**: 完整且正确
- 用户设置 → Electron Store → 转录调用 → 后端API → 引擎处理 → 结果返回

✅ **所有功能都已实现并正确连接**

---

## 8. 注意事项

### 说话人识别
- 主要对 **FunASR 引擎** 有效
- 需要在 "引擎设置" 中启用 "说话人识别" 开关
- 注册说话人需要 5-10 秒的清晰语音样本
- 转录结果的 segments 中会包含 `speaker` 字段

### 词汇功能
- 主要对 **FunASR 引擎** 有效
- 词汇以逗号分隔传递给后端
- 可以提高专有名词的识别准确率
- AI 精炼功能也会使用这些词汇

### 测试建议
1. 使用 FunASR 引擎测试 (seaco-paraformer 模型)
2. 先注册说话人，再启用说话人识别
3. 添加常用的专有名词到词汇表
4. 查看后端日志确认参数传递正确
