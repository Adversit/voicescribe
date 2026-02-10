# 录音功能修复说明

## 问题
快捷键触发后，录音悬浮窗没有显示，录音功能不工作。

## 原因
Electron 的 `main.ts` 中录音逻辑不完整，缺少实际的音频录制实现。

## 解决方案

### 1. 创建音频录制器 (`src/lib/audio-recorder.ts`)
- 使用浏览器 MediaRecorder API 录制音频
- 支持麦克风访问和音频流处理
- 返回 ArrayBuffer 格式的音频数据

### 2. 创建全局录音管理器 (`src/components/GlobalRecordingManager.tsx`)
- 监听 Electron IPC 事件
- 协调录音开始/停止
- 调用后端转录 API
- 保存结果到历史记录

### 3. 更新 Electron 主进程 (`electron/main.ts`)
- 添加 `start-audio-recording` 事件发送
- 添加 `stop-audio-recording` 事件发送
- 添加 `recording-complete` 和 `recording-error` 事件处理

### 4. 更新 Preload 脚本 (`electron/preload.ts`)
- 添加通用 `on` 方法用于监听事件
- 添加 `recording.complete` 和 `recording.error` 方法

### 5. 集成到主页面 (`src/app/page.tsx`)
- 添加 `<GlobalRecordingManager />` 组件

## 工作流程

```
用户按下快捷键
  ↓
Electron 主进程触发 toggleRecording()
  ↓
发送 'start-audio-recording' IPC 事件
  ↓
GlobalRecordingManager 接收事件
  ↓
AudioRecorder 开始录音（MediaRecorder）
  ↓
显示录音悬浮窗（实时音量显示）
  ↓
用户再次按下快捷键
  ↓
Electron 主进程触发 stopRecording()
  ↓
发送 'stop-audio-recording' IPC 事件
  ↓
GlobalRecordingManager 停止录音
  ↓
获取音频 ArrayBuffer
  ↓
调用后端 /transcribe API
  ↓
显示 "thinking" 状态
  ↓
转录完成
  ↓
保存到历史记录
  ↓
复制到剪贴板（根据设置）
  ↓
隐藏悬浮窗
```

## 测试步骤

1. 重新编译 Electron：
   ```bash
   cd frontend
   npm run build:electron
   ```

2. 启动应用：
   ```bash
   npm run dev:electron
   ```

3. 按下快捷键（默认 Alt+R）

4. 应该看到：
   - 录音悬浮窗出现
   - 实时音量波形显示
   - 录音时长计时

5. 再次按下快捷键停止

6. 应该看到：
   - "thinking" 动画
   - 转录完成后悬浮窗消失
   - 结果复制到剪贴板
   - 历史记录中出现新记录

## 注意事项

1. **麦克风权限**：首次使用需要授予浏览器麦克风权限
2. **音频格式**：使用 WebM 格式，后端需要支持
3. **后端连接**：确保后端服务运行在 http://127.0.0.1:8765
4. **设置同步**：录音使用当前设置（引擎、模型、语言等）

## 已修复的文件

- ✅ `frontend/src/lib/audio-recorder.ts` - 新建
- ✅ `frontend/src/components/GlobalRecordingManager.tsx` - 新建
- ✅ `frontend/src/app/page.tsx` - 更新
- ✅ `frontend/electron/main.ts` - 更新
- ✅ `frontend/electron/preload.ts` - 更新

## 下一步

如果录音功能仍有问题，检查：
1. 浏览器控制台是否有错误
2. Electron 主进程日志
3. 后端服务是否正常运行
4. 麦克风权限是否已授予
