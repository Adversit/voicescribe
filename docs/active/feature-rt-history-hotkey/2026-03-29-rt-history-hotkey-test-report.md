# 实时转录、历史记录与快捷键录制专题测试报告

更新时间：2026-03-29

关联文档：
- [专题需求文档](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-rt-history-hotkey\2026-03-28-rt-history-hotkey-requirements.md)
- [专题 Spec](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-rt-history-hotkey\2026-03-28-rt-history-hotkey-spec.md)
- [主测试文档](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\第一阶段测试.md)

## 1. 测试范围

本轮覆盖以下代码与链路：
- 后端 `/history` API
- 后端 `/summary` API
- 后端 `/stream` WebSocket
- 实时转录/历史记录/快捷键录制相关前端构建
- Tauri Rust 命令层构建
- 当前桌面端启动链与 `/health`

## 2. 已执行测试

### 2.1 代码层构建验证

执行目录：
- `D:\learn\AIGC\voicescribe\0324\voicescribe`

执行命令：
- `python -m py_compile backend/server.py backend/config.py backend/postprocess/ai_refiner.py backend/engines/funasr_engine.py`
- `npm run build`
- `cargo check`

结果：
- 通过

### 2.2 历史记录 API 烟测

执行方式：
- 启动桌面应用与当前后端
- 调用：
  - `DELETE /history`
  - `POST /history`
  - `GET /history`
  - `GET /history/{record_id}/download/text`
  - `DELETE /history/{record_id}`
  - `DELETE /history`

结果：
- 通过

说明：
- 已验证历史记录新增、查询、文本导出、删除单条、清空全部的主链路可用。

### 2.3 AI 摘要接口烟测

执行方式：
- 调用 `POST /summary`

结果：
- 通过

说明：
- 已验证流式专题需要的 AI 摘要后端接口可返回结果。
- 在最小依赖或 mock 场景下允许走回退摘要逻辑。

### 2.4 `/stream` WebSocket 烟测

执行方式：
- 连接 `ws://127.0.0.1:8765/stream`
- 发送 16kHz / 16-bit / mono PCM 模拟音频块
- 读取首条流式消息

结果：
- 通过

说明：
- 已收到 `type=entry` 的实时片段消息。
- 当前 mock 模式下返回的示例文本为 `"[Mock] 正在实时转录..."`。

### 2.5 桌面启动链回归验证

执行方式：
- `cmd /c scripts\start_windows_system.bat`
- `GET /health`
- `Get-Process voicescribe-desktop`

结果：
- 通过

说明：
- 当前桌面进程已正常启动。
- `/health` 返回 `healthy`。
- 说明新增侧边栏页面与相关状态层已集成进桌面启动链。

## 3. 当前结论

本专题当前结论如下：
- 后端历史记录 API 与 AI 摘要 API 已落地并通过烟测。
- `/stream` 到实时转录页所需的数据契约已打通。
- 历史记录与实时转录页面已进入当前主窗口侧边栏。
- 快捷键录制的代码能力已落地并通过构建验证。

当前仍未纳入本报告的项目：
- 快捷键真实录制的人工作用验收
- 真实麦克风录音驱动的流式转录体验
- 历史记录页复制/下载/删除/清空的人机界面验收
- AI 摘要在实时转录页与历史记录详情中的最终人工确认

## 4. 修改超过两次的 Bug

### 4.1 `backend/server.py` 在专题开发过程中出现编码污染

表现：
- `py_compile` 失败
- 文件中混入不可见字符与私有区字符
- 继续局部修补会连带破坏 docstring 与函数体

为什么算“修改超过两次”：
- 最初是局部插入历史记录与摘要逻辑
- 后续为修编码问题进行过字符清理
- 清理后又发现函数体被破坏
- 最终只能从 `git show HEAD:backend/server.py` 恢复，再重新整块回放改动

最终处理：
- 从 Git 基线恢复 `backend/server.py`
- 重新整块补回 `/history`、`/summary`、`/stream` 相关实现
- 重新跑 `py_compile`、API 烟测和桌面启动链验证

### 4.2 `/stream` 原始音频数据契约前后端不一致

表现：
- 早期实现把收到的原始 PCM 直接当成 `.wav` 文件处理
- 这会让流式转录链路在真实音频块下不稳定，甚至不可用

为什么算“修改超过两次”：
- 最初只是把录音数据送入 `/stream`
- 后续发现写盘方式不是真正的 WAV
- 再次调整后，还要同步 Rust 侧 `audio-chunk` 事件的编码方式
- 最终才收口为“Rust 发 PCM 块 + 后端 `_write_pcm16_wav()` 包装后再转录”的统一契约

最终处理：
- Rust 侧 `audio.rs` 发 base64 PCM 音频块
- 前端流式桥接把音频块发送给 `/stream`
- 后端 `_write_pcm16_wav()` 负责把原始 PCM 封装为合法 WAV 再进入转录链路


### 2.11 快捷键单击切换状态机改造

执行目录：D:\learn\AIGC\voicescribe\0324\voicescribe

执行方式：
- 先按 2026-03-29 补充约定更新 hotkey 专题 requirements/spec，确认“保留长按模式，同时把双击切换改为单击切换”
- 修改 `tauri-app/src-tauri/src/commands/hotkey.rs`
- 运行 cargo check
- 运行 `npm run build`

结果：通过

说明：
- Rust 状态机已移除双击判定和 last_press_time，热键完整按压现在按单击切换处理：空闲态单击开始，录音态单击停止
- 长按语义保留：超过阈值时开始录音，松开时停止，且不会在释放时再次落入单击切换分支
- Esc 取消链路未改
- 当前仅完成编译与构建验证；真实桌面端仍需补做“单击开始 / 单击停止 / 长按开始 / 松开停止”四项手测
### 2.12 快捷键单击切换改造后二进制启动验证

执行目录：D:\learn\AIGC\voicescribe\0324\voicescribe

执行方式：
- 运行 cmd /c scripts\start_windows_system.bat
- 运行 curl.exe http://127.0.0.1:8765/health
- 运行 Get-Process voicescribe-desktop | Select-Object Id,ProcessName,StartTime

结果：通过

说明：
- 热键单击切换改造后的桌面端已重启到最新构建，当前进程启动时间为 2026-03-29 12:17:01
- 后端健康检查返回 healthy，且 mock_mode=false
- 当前可以直接进行真实手测，无需再额外手动重启前后端
### 2.13 快捷键设置页单击说明文案纠正

执行目录：D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app

执行方式：
- 保持 hotkey 专题 requirements/spec 为“单击开始、再次单击停止 + 长按保持”口径
- 修改 `tauri-app/src/pages/HotkeySettings.tsx` 的“使用方式”说明文案
- 运行 `npm run build`
结果：通过

说明：
- 设置页残留的“双击模式 / 快速双击开始持续录音”文案已纠正为“单击模式 / 单击开始持续录音，再按一次停止”
- 当前仅修正文案，不涉及新的 Rust 状态机改动
### 2.14 快捷键设置页单击文案修正后二进制重启验证

执行目录：D:\learn\AIGC\voicescribe\0324\voicescribe

执行方式：
- 运行 cmd /c scripts\start_windows_system.bat
- 运行 curl.exe http://127.0.0.1:8765/health
- 运行 Get-Process voicescribe-desktop | Select-Object Id,ProcessName,StartTime

结果：通过

说明：
- 文案修正后的桌面端已重启到最新构建，当前进程启动时间为 2026-03-29 12:27:23
- 后端健康检查返回 healthy，且 mock_mode=false
- 当前可以直接检查设置页是否显示“单击模式 / 单击开始持续录音，再按一次停止”

## 5. 与主文档的关系

本报告只记录本专题的测试与问题。

主线状态仍以以下文档为准：
- [2026-03-25-voicescribe-windows-spec.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\2026-03-25-voicescribe-windows-spec.md)
- [2026-03-26-implementation-gap-checklist.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\2026-03-26-implementation-gap-checklist.md)
- [2026-03-25-session-bug-log.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\2026-03-25-session-bug-log.md)
