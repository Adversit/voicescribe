# 2026-03-29 录音悬浮窗与录音流专题 Spec
更新日期：2026-03-29
适用分支：`0325main`

## 1. 状态模型

`OverlayStatePayload` 统一为：
- `mode`
- `startedAt`
- `audioLevel`
- `canCancel`
- `canStop`

`mode` 只允许：`hidden`、`recording`、`transcribing`、`cancelled`。

## 2. 事件桥接

主窗口是唯一录音流入口：
- `beginRecordingSession`
- `finishRecordingSession`
- `abortRecordingSession`

停止录音时补充一条前端最短时长判定：
- `finishRecordingSession` 先读取当前录音时长；
- 若低于最短有效录音阈值，则直接取消本次录音、隐藏 overlay，并提示“录音时间过短”；
- 只有满足阈值时，才进入 `transcribing`。

悬浮窗只发出显式交互事件：
- `overlay-ready`
- `overlay-cancel-recording`
- `overlay-stop-recording`

## 3. 首次显示策略

`showOverlay(payload)` 改为：
1. 先 `show_overlay`；
2. 等待 `overlay-ready` 或短超时；
3. 再推送 `overlay-state`。

目的是消除第一次显示时的事件竞态。

## 4. 真实波纹

- Rust 录音链路持续发出 `audio-level`；
- `audio-level` 同时发给 `main` 和 `overlay`；
- `recording` 状态下中间波纹只根据实际电平更新；
- `transcribing` 和 `cancelled` 不显示伪波纹运动。

## 5. 视觉规范

### 5.1 Recording
- 底部居中胶囊条；
- overlay 页面背景完全透明；
- 左侧是取消按钮，图标为叉号；
- 中间是真实波纹 + 时长；
- 右侧是完成按钮，图标为对勾；
- 不再显示米色外层面板或整块背景。

### 5.2 Transcribing
- 单胶囊状态提示；
- 文案为“正在转录”。

### 5.3 Cancelled
- 短暂显示“已取消录音”；
- 稍后自动隐藏。

## 6. 验证要求

### 6.1 可自动执行
- `npm run build`
- `cargo check`
- `cmd /c scripts\start_windows_system.bat --skip-build`
- `GET http://127.0.0.1:8765/health`

### 6.2 需要人工验收
- 首次触发是否显示悬浮窗；
- 主窗口开始录音是否显示悬浮窗；
- 悬浮窗显示后快捷键是否可以停止；
- 取消 / 停止按钮是否生效；
- 波纹是否跟随真实麦克风输入。
- 录音时间过短时是否直接收口而不是卡住。
