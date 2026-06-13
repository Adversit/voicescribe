# VoiceScribe BUGS

更新时间：2026-06-13

## 1. 高优先级未收口问题

### 1.1 冷启动后 `Right Alt` 不触发

状态：
- 已收口，待持续观察

当前事实：
- 2026-04-03 已用快速启动脚本回归冷启动日志，确认启动注册链真实存在：`use-hotkey register requested -> register_hotkey_binding -> ensure_hook_thread: startup confirmed`
- 冷启动时 runtime 绑定确实是 `0xA5`
- 现有强根因候选是 Windows 某些布局会把 `Right Alt` 当成 AltGr，上报成 `Ctrl + Right Alt`，旧的精确集合匹配会把单键 `0xA5` 漏掉
- 2026-04-03 已在 Rust runtime 中为单键 `Right Alt` 增加 AltGr 容错匹配，并补了单元测试
- 2026-04-03 新观察到：在 `VoiceScribe` 窗口聚焦时按 `Right Alt` 与切到 VSCode 后按 `Right Alt` 的体感不同；当前更像是前台窗口输入上下文差异，而不是 hook 线程整体失效
- 2026-04-03 已新增 `foreground_alt_raw` 定向日志，只在前台属于 `VoiceScribe` 主窗口且事件涉及 `Alt/Right Alt` 时记录原始 `vk/scan/flags/message/normalized_vk`
- 2026-04-03 新确认：当焦点在 `VoiceScribe` 主窗口内时，`Right Alt` 不会进入现有 Rust `foreground_alt_raw` / `hotkey_state` 诊断链；而切到外部应用后同键仍可进入全局热键链
- 2026-04-03 已新增前端主窗口兜底路径：`useHotkey.ts` 在单键 `Right Alt` 绑定下直接监听主窗口 `AltRight keydown/keyup`，复用 `recordingFlow.ts` 开始/停止录音，并通过 `hotkeyCaptureActive` 与 250ms 去重避免和设置页录制态、native 事件冲突
- 2026-04-03 用户真机确认：`VoiceScribe` 主窗口前台 `Right Alt` 已可开始/停止录音，问题已解决

下一步：
- 确认修复后是否仍存在只在特定输入法/键盘布局下失效的分支

### 1.2 热键 Apply 后恢复慢

状态：
- 未收口

当前事实：
- 当前代码里没有对应 7-8 秒的显式等待
- 已补 shared `trace_id` 和毫秒级日志
- 还没定位真实延迟点

下一步：
- 基于共享日志定位延迟点后再改行为

## 2. 中优先级未收口问题

### 2.1 `3D-Speaker` 下载后真实加载与真实转录未验

状态：
- 未收口

当前事实：
- 2026-04-03 已执行真实加载检查，`ensure_diarization_loaded('3d-speaker')` 不是“未测”，而是明确失败
- 当前 `3d-speaker` bundle 只下载了 speaker embedding 和 VAD 组件，没有 VoiceScribe 可运行的完整 diarization integration
- 原先运行时会误走通用 `modelscope speaker-diarization` 路径，现已改成返回明确 runtime 不可用错误，避免继续误判成环境偶发问题

下一步：
- 决定是否真正接入 3D-Speaker 官方 diarization 推理链
- 如果短期不接，考虑把 `3d-speaker` 从默认 diarization 推荐项降级为“下载资产已到位但运行时未实现”

## 3. 已收口但仍待人工确认的项

- 热键运行时 stale key 恢复
- observe-only runtime hook
- settings capture 期间 suspend runtime matching
- startup/apply trace diagnostics
- 悬浮窗视觉与事件桥接主链
- 2026-04-03：`AI refine` 能力不可用时原先会静默跳过且不给提示；现已改为保留原始转录，并通过 `TranscribeResult.warnings[] -> recordingFlow toast` 显式提示降级
- 2026-04-03：`/speakers/register` 曾在 CUDA 环境下因 speaker embedding 落盘链处理不当导致 500；现已改成 GPU tensor 主链，实时识别走 `torch`/CUDA，相似度计算用 `cosine_similarity`，新注册 speaker 写 `.pt`；历史 `.npy` 会在 `_load_speakers()` 阶段自动迁移成 `.pt` 并删除旧文件

## 4. Typeless 文本处理运行时

### 4.1 本地 OpenAI-compatible 真实模型尚未验收

状态：
- 未收口

当前事实：
- `openai_compatible` adapter 单元测试已通过，默认 endpoint 为 `http://127.0.0.1:11434/v1`
- 本机 `ollama list` 当前没有可用模型；为避免未经确认下载大模型，本轮没有执行真实本地模型推理
- VoiceScribe 管理的 `OLLAMA_MODELS` 已强制指向 `<repo>/models/ollama`
- 2026-06-13 已增加设置页就绪探测；当前本机 endpoint 探测约 2.1 秒后明确返回 `unavailable / timed out`

下一步：
- 在仓库 `models/ollama` 下准备一个明确大小的模型后，完成真实 `/transcribe -> text processing -> history` 验收

### 4.2 Codex 无头处理延迟偏高

状态：
- 待优化

当前事实：
- 2026-06-13 真实 smoke test 中，Codex CLI 约耗时 22.8 秒，Codex SDK 两次约耗时 15.3 秒和 20.6 秒
- 两条路径均成功返回清理后的文本，功能正确但不适合作为低延迟默认体验
- 设置页就绪探测现在可确认 CLI/SDK 是否存在，但其毫秒级静态探测耗时不代表真实生成延迟

下一步：
- 增加 provider 可用性/延迟探测，并为默认选择提供性能提示
- 评估进程复用、流式输出和更小本地模型

### 4.3 Claude CLI 曾继承仓库上下文并偏离文本清理任务

状态：
- 已收口

当前事实：
- 首次真实调用会读取项目上下文并返回与文本清理无关的说明
- 已增加 `--safe-mode`、禁用工具与 slash command、独立 system prompt
- 2026-06-13 修复后真实调用约 4.2 秒并返回正确清理文本

### 4.4 FastAPI 启动事件存在弃用警告

状态：
- 未收口，低优先级

当前事实：
- mock backend 启动时会报告 `on_event` 已弃用
- 当前不影响 API 行为，但后续应迁移至 lifespan handler

### 4.5 Windows 目标应用分类仍依赖窗口标题启发式

状态：
- 未收口

当前事实：
- Phase B 首轮已在录音开始时保存目标窗口快照，并只透传最小应用类别
- 当前应用类别由本地窗口标题规则识别，不持久化完整标题
- 浏览器、定制标题和本地化应用名称可能被归类为 `other`

下一步：
- Windows 真机回归代码编辑器、聊天、邮件、终端和浏览器
- 评估使用仅文件名级别的进程信息提升分类准确率，同时继续禁止完整路径和标题进入请求/history

## 5. Phase C 可见处理流水线

### 5.1 Windows 真机阶段序列与输出仍待验收

状态：
- 未收口

当前事实：
- 桌面主链已经拆成 raw ASR、独立文本处理、外部输出三个真实阶段
- 主窗口真实挂载的 `Layout` 和 Overlay 已共享 `appStore.pipeline`
- 自动化、构建、mock HTTP smoke 和浏览器渲染回归已通过
- 尚未在 Windows 目标应用中完成一次非 raw 与一次 raw 的完整录音输出验证

下一步：
- 非 raw Profile 真机确认 `transcribing -> polishing -> outputting`
- raw Profile 真机确认不出现 `polishing`
- 确认最终文本、warning、history 和阶段耗时符合本轮契约

### 5.2 Phase C 测试中发现并已修复的局部问题

状态：
- 已收口

当前事实：
- 首版路由测试使用 Starlette `TestClient`，但当前环境缺少其新增的 `httpx2` 依赖；已改为直接调用异步路由函数，不新增运行时依赖，19 项后端测试通过
- 首版主窗口状态接到了未挂载的 `ShellHeader`；已通过真实浏览器渲染发现并改接到实际挂载的 `Layout`
- 浏览器开发模式会由 backend/hotkey/tray hooks 误调用 Tauri `invoke` 并弹错误 toast；已增加运行时守卫，浏览器回归确认该 toast 消失

## 5. 记录规则

- 本文件只保留当前仍有协作价值的问题
- 历史问题与完整时间线从 Git 历史查看
