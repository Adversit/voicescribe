# 2026-03-29 录音悬浮窗与录音流专题测试报告
更新日期：2026-03-29
适用分支：`0325main`

## 当前状态

本文档记录本专题的构建验证、启动验证和人工验收结果。

## 自动验证

- `npm run build`：通过
- `cargo check`：通过
- `cmd /c scripts\start_windows_system.bat`：通过
- `GET http://127.0.0.1:8765/health`：通过，`status=healthy`，`mock_mode=false`
- 代码链路已改为：悬浮窗波纹只使用 Rust 录音时的真实 `audio-level` 事件。
- 前端已补充最短有效录音时长判断：FunASR 录音低于 1 秒时，不再进入长时间 `transcribing`
- Rust `transcribe` 命令已改为：后端返回 4xx 时立即失败，不再重复重试 30 次
- overlay 页面已单独改为透明背景；录音态改为黑色胶囊、左侧叉号、右侧对勾

## 2026-03-29 本轮新增日志验证范围

- 录音开始链：`beginRecordingSession`、`startRecording`、`showOverlay`
- overlay 链：`overlay-ready`、`overlay-state`、实际 `mode`
- 录音停止链：`finishRecordingSession`、最短时长判定、`stopRecording`
- 转录入口：`transcribeAudio(engine, model)` 与后端 `/transcribe`
- 模型懒加载：`ensure_engine_loaded(...)`

本轮测试先补日志，再重启桌面端，最后按“开始录音 -> overlay 显示 -> 停止录音 -> 模型懒加载 -> 历史记录入库”整链回归。

## 待人工验收

1. 快捷键首次触发后，悬浮窗是否稳定出现。
2. 主窗口点击开始录音后，悬浮窗是否稳定出现。
3. 悬浮窗显示后，再按一次快捷键是否能停止录音。
4. 点击取消 / 停止按钮是否能真实生效。
5. 波纹是否明显跟随真实麦克风输入。
6. 录音时间过短时，是否直接提示并收口，而不是卡在“正在转录”。
7. 录音中 / 转录中 / 已取消 三种视觉态是否正确，且录音态为黑色胶囊、左叉右勾、没有米色背景板。

## 2026-03-29 22:20 日志测试结论

- 自动验证：`npm run build`、`cargo check`、`cmd /c scripts\start_windows_system.bat`、`GET /health` 均通过。
- 热键链路：日志确认 `Right Alt -> hotkey-start-recording -> beginRecordingSession -> startRecording success` 已正常命中，当前问题不在热键匹配。
- overlay 断点：`C:\Users\DingK\AppData\Local\Temp\voicescribe-hotkey.log` 明确记录 `frontend overlay bind failed: Command plugin:event|listen not allowed by ACL`。
- 当前结论：首次录音后悬浮窗不稳定显示、再次操作只出现空框，根因是 overlay 窗口事件监听权限缺失，不是“快捷键没触发”。
- 下一步：修复 Tauri capability 后，再回归验证 `overlay-ready`、`overlay-state`、`audio-level` 与停止后 `/transcribe` 懒加载链路。
## 2026-03-29 22:25 ACL 修复后自动验证

- `tauri-app/src-tauri/capabilities/main.json` 已将 capability 覆盖窗口扩展为 `main` 与 `overlay`。
- 重新执行 `npm run build`、`cargo check`、`cmd /c scripts\start_windows_system.bat` 后，热键日志出现 `frontend overlay bind success` 与 `frontend overlay-ready emitted to main`。
- 说明：overlay 页面已能在冷启动后正常监听事件，原先由 ACL 导致的“第一次点击后悬浮窗不显示真实状态”阻塞项已解除。
- 自动补充验证：用仓库内临时生成的 1.2 秒 `wav` 调用 `/transcribe`，`/health.loaded_engines.funasr` 已变为 `seaco-paraformer`，证明停止后懒加载进入后端的这半段链路仍然有效。
- 剩余待人工验收：真实点击开始录音后的黑色胶囊显示、左叉右勾交互、再次按快捷键停止、过短录音收口与真实波纹展示。
## 2026-03-29 22:30 新增待验证项
- UI：overlay 外层米黄色背景板必须完全消失，只保留黑色胶囊。
- 波纹：overlay 中间波纹必须由真实 PCM 录音块驱动，而不是仅依赖 `audio-level` 标量造成的 0/1 亮灭感。
- 人工验收：重点观察“中心聚焦、边缘衰减”的录音波纹观感是否恢复。
## 2026-03-29 22:35 透明根层与真实 PCM 波纹实现
- `overlay.html` 已给 `html` 根节点补上 `overlay-window` 类。
- `globals.css` 已把透明约束扩大到 `html.overlay-window + body.overlay-window + #overlay-root`，用于彻底移除米黄色背景板。
- `audio.rs` 已把真实 `audio-chunk` PCM 事件同时发送给 `main` 与 `overlay`。
- `RecordingOverlay.tsx` 已改为优先消费真实 `audio-chunk` 计算柱条，只把 `audio-level` 当作首帧/回退信号；柱条做了轻度平滑和镜像排布，以恢复“中心聚焦、边缘衰减”的录音波纹观感。
- 静态验证：`npm run build`、`cargo check` 已再次通过。