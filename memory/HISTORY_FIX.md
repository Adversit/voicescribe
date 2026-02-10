# 历史记录功能修复

## 修复日期
2026-02-10

## 问题描述
1. **F12 开发者工具无法打开** - 用户无法查看渲染进程的控制台日志
2. **历史记录不保存** - 转录完成后，记录没有保存到历史列表
3. **界面语言为英文** - 历史记录界面使用英文而非中文

## 根本原因

### 问题 1: F12 开发者工具
- **原因**: 开发者工具已经在代码中启用，但只在开发模式下自动打开
- **位置**: `frontend/electron/main.ts` 第 62-63 行
- **代码**:
  ```typescript
  if (process.env.ELECTRON_START_URL) {
      mainWindow.loadURL(startUrl);
      mainWindow.webContents.openDevTools(); // 已启用
  }
  ```

### 问题 2: 历史记录不保存
- **原因**: 事件监听器使用了错误的 API
- **错误代码**: `window.electron.on('transcription-complete', ...)`
- **正确代码**: `window.electron.transcription.onComplete(...)`
- **位置**: `frontend/src/components/GlobalRecordingManager.tsx`

**详细说明**:
- `preload.ts` 将 `transcription-complete` 事件暴露为 `window.electron.transcription.onComplete()`
- 但 `GlobalRecordingManager.tsx` 使用了通用的 `window.electron.on()` 方法
- 这导致事件监听器注册失败，渲染进程无法接收到转录完成事件
- 主进程正确发送了事件，但渲染进程没有正确监听

### 问题 3: 界面语言
- **原因**: 所有文本都是硬编码的英文
- **位置**: `frontend/src/components/settings/HistorySettings.tsx`

## 修复内容

### 1. GlobalRecordingManager.tsx
**修改前**:
```typescript
window.electron?.on?.('transcription-complete', handleTranscriptionComplete);
```

**修改后**:
```typescript
const unsubscribeTranscription = window.electron?.transcription?.onComplete(handleTranscriptionComplete);

// 在 cleanup 中取消订阅
return () => {
    if (unsubscribeTranscription) {
        unsubscribeTranscription();
    }
    // ...
};
```

**关键变化**:
- 使用正确的 API: `window.electron.transcription.onComplete()`
- 移除了 `_event` 参数 (新 API 直接传递 data)
- 添加了取消订阅逻辑

### 2. HistorySettings.tsx - 中文本地化

**标题和描述**:
- "Transcription History" → "转录历史"
- "View, edit, and manage your transcription history" → "查看、编辑和管理您的转录历史记录"

**搜索和按钮**:
- "Search" → "搜索"
- "Search transcriptions..." → "搜索转录内容..."
- "Clear All" → "清空全部"
- "Total: X transcriptions" → "共 X 条记录"

**空状态消息**:
- "No matching transcriptions found" → "未找到匹配的转录记录"
- "No transcriptions yet" → "暂无转录记录"

**按钮提示**:
- "Copy to clipboard" → "复制到剪贴板"
- "Export" → "导出"
- "Export as TXT" → "导出为 TXT"
- "Export as MD" → "导出为 MD"

**分段显示**:
- "View segments (X)" → "查看分段 (X)"
- "Xs" → "X秒"

**导出文件内容**:
- "Transcription" → "转录记录"
- "Date:" → "日期:"
- "Duration:" → "时长:"
- "Engine:" → "引擎:"
- "Model:" → "模型:"
- "Language:" → "语言:"
- "Text" → "文本内容"
- "Segments" → "分段内容"
- "transcription-{id}.txt" → "转录_{id}.txt"
- "transcription-{id}.md" → "转录_{id}.md"

**日期格式**:
- `toLocaleString()` → `toLocaleString('zh-CN')`

## 测试步骤

### 1. 重新构建
```bash
cd frontend
npm run build:electron
```

### 2. 启动应用
```bash
# 在项目根目录
scripts\windows\dev.bat
```

### 3. 验证 F12 开发者工具
- Electron 窗口应该自动打开开发者工具
- 如果没有，按 F12 或 Ctrl+Shift+I
- 控制台应该显示:
  ```
  [GlobalRecordingManager] Component mounted
  [GlobalRecordingManager] IPC listeners registered
  ```

### 4. 测试录音和历史记录
1. 按住 Alt+B 开始录音
2. 说话: "你好，这是一个测试"
3. 松开 Alt+B 停止录音
4. 观察控制台输出:
   - 主进程: `[Main] Sending transcription-complete event to main window`
   - 渲染进程: `[GlobalRecordingManager] ===== TRANSCRIPTION COMPLETE EVENT =====`
   - 渲染进程: `[GlobalRecordingManager] Transcription added to store`
5. 点击左侧菜单的 "历史记录" 标签
6. 应该能看到刚才的转录记录

### 5. 验证中文界面
- 标题应该是 "转录历史"
- 搜索框占位符应该是 "搜索转录内容..."
- 按钮应该是 "清空全部"
- 记录计数应该是 "共 X 条记录"
- 日期格式应该是中文格式 (例如: 2026/2/10 23:34:36)

### 6. 测试历史记录功能
- 复制按钮 - 应该复制文本到剪贴板
- 导出按钮 - 应该显示中文菜单 "导出为 TXT" 和 "导出为 MD"
- 导出文件 - 文件名应该是 "转录_{id}.txt" 或 "转录_{id}.md"
- 导出内容 - 应该是中文标签 (日期、时长、引擎等)
- 编辑按钮 - 应该能编辑文本
- 删除按钮 - 应该删除记录
- 清空全部按钮 - 应该清空所有记录

## 事件流程

### 完整的录音到历史记录流程:

1. **用户按下热键** (Alt+B)
   - `main.ts`: `toggleRecording()` → `startRecording()`
   - 显示 overlay 窗口
   - 发送 `start-audio-recording` 事件到渲染进程

2. **渲染进程开始录音**
   - `GlobalRecordingManager.tsx`: 接收 `start-audio-recording` 事件
   - `audio-recorder.ts`: 开始 MediaRecorder 录音

3. **用户松开热键**
   - `main.ts`: `toggleRecording()` → `stopRecording()`
   - 发送 `stop-audio-recording` 事件到渲染进程

4. **渲染进程停止录音并转录**
   - `GlobalRecordingManager.tsx`: 接收 `stop-audio-recording` 事件
   - `audio-recorder.ts`: 停止录音，获取音频数据
   - 调用 `window.electron.recording.transcribeAudio(audioBuffer)`

5. **主进程处理转录**
   - `main.ts`: `transcribe-audio` IPC handler
   - 保存音频到临时文件
   - 调用 `transcribeAudioFile(audioPath)`
   - 调用后端 API: `backend.transcribe()`
   - 等待至少 1 秒 (显示 "thinking" 状态)

6. **转录完成**
   - `main.ts`: `transcriptionComplete(text, result)`
   - 发送 `transcription-complete` 事件到主窗口
   - 事件数据: `{ text, result }`

7. **渲染进程保存历史记录**
   - `GlobalRecordingManager.tsx`: 接收 `transcription-complete` 事件 (通过 `window.electron.transcription.onComplete()`)
   - 获取当前设置: `window.electron.settings.get()`
   - 构建转录对象
   - 调用 `addTranscription(transcription)` 保存到 Zustand store
   - Zustand store 自动持久化到 localStorage

8. **用户查看历史记录**
   - 点击 "历史记录" 标签
   - `HistorySettings.tsx` 从 Zustand store 读取 `transcriptions`
   - 显示中文界面和记录列表

## 相关文件

### 修改的文件:
- `frontend/src/components/GlobalRecordingManager.tsx` - 修复事件监听
- `frontend/src/components/settings/HistorySettings.tsx` - 中文本地化

### 相关文件 (未修改):
- `frontend/electron/main.ts` - 主进程逻辑 (已正确)
- `frontend/electron/preload.ts` - IPC 暴露 (已正确)
- `frontend/src/store/app-store.ts` - Zustand store (已正确)
- `frontend/electron/backend.ts` - 后端 API 调用 (已正确)

## 故障排查

### 如果历史记录仍然不保存:

1. **检查主进程日志** (后台窗口):
   - 应该看到: `[Main] Sending transcription-complete event to main window`
   - 如果没有，说明转录流程有问题

2. **检查渲染进程日志** (F12 控制台):
   - 应该看到: `[GlobalRecordingManager] ===== TRANSCRIPTION COMPLETE EVENT =====`
   - 如果主进程有但渲染进程没有，说明事件传递失败
   - 检查 `preload.ts` 和 `GlobalRecordingManager.tsx` 的事件注册

3. **检查 Zustand store**:
   - 在 F12 控制台运行: `localStorage.getItem('voicescribe-storage')`
   - 应该看到包含 `transcriptions` 数组的 JSON
   - 如果为空，说明 store 没有正确保存

4. **检查组件挂载**:
   - 在 F12 控制台应该看到: `[GlobalRecordingManager] Component mounted`
   - 如果没有，检查 `page.tsx` 是否包含 `<GlobalRecordingManager />`

### 如果界面不是中文:

1. **确保重新构建**:
   ```bash
   cd frontend
   npm run build:electron
   ```

2. **重启 Electron 应用**:
   - 完全关闭应用 (包括托盘图标)
   - 重新运行 `dev.bat`

3. **清除缓存**:
   - 删除 `frontend/dist-electron` 目录
   - 重新运行 `npm run build:electron`

## 技术要点

### IPC 事件传递
- Electron 的 IPC 事件需要在 `preload.ts` 中正确暴露
- 渲染进程只能使用 `contextBridge.exposeInMainWorld()` 暴露的 API
- 不能直接使用 `ipcRenderer.on()` (因为 `contextIsolation: true`)

### Zustand 持久化
- 使用 `persist` 中间件自动保存到 localStorage
- 存储键: `voicescribe-storage`
- 每次 `addTranscription()` 调用都会触发持久化

### React 事件监听
- 在 `useEffect` 中注册事件监听器
- 在 cleanup 函数中取消订阅
- 避免内存泄漏

## 下一步

历史记录功能现在应该完全正常工作:
- ✅ F12 开发者工具可用
- ✅ 转录记录正确保存
- ✅ 界面完全中文化
- ✅ 所有历史记录功能可用 (查看、编辑、删除、导出)

用户可以:
1. 使用 `scripts\windows\test_history.bat` 进行完整测试
2. 查看 F12 控制台验证事件流程
3. 在历史记录界面管理所有转录记录
