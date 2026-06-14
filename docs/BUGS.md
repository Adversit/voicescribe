# VoiceScribe BUGS

更新时间：2026-06-14

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
- 2026-06-14：UTF-8 内容扫描发现 `backend/diarization/speaker.py` 的 `diarize()` docstring 存在已提交的连续问号损坏；已用 ASCII 英文恢复说明，并通过后端静态导入与测试。

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
- 已收口

当前事实：
- 2026-06-13 已把旧 `@app.on_event("startup")` 迁移到 FastAPI lifespan
- 自动化确认 lifespan 调用一次现有预加载入口
- 真实 mock backend 启动成功，保留预加载跳过行为且不再报告 `on_event` 弃用警告

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

### 5.3 文本润色取消仍有 Provider 边界

状态：
- 部分收口

当前事实：
- Claude CLI、Codex CLI 已支持终止真实子进程树，Codex SDK 已支持 `turn.interrupt()`
- VoiceScribe 任务状态会在取消后保持 `cancelled`，不会发布迟到结果，也不会输出或写入 history
- OpenAI-compatible 当前使用同步 HTTP 请求；VoiceScribe 能立即丢弃结果，但本地模型服务是否立即停止计算取决于该服务的断连处理
- ASR 和 `outputting` 使用不同的运行时与 OS 交互契约，本轮没有伪装成“任意阶段可取消”

下一步：
- 在 Windows 桌面使用真实 Claude/Codex 任务完成 Overlay 取消闭环验收
- 为 OpenAI-compatible 增加可中止 HTTP transport，并按 Ollama/兼容服务分别验证服务端停止行为
- 分别设计 ASR 任务取消和文本注入取消/回滚契约

## 6. Phase D Style 与 Agent

### 6.1 Style Profile 仍缺全局热键/托盘切换与真机验收

状态：
- 未收口

当前事实：
- 首轮已支持本地 Style 创建、编辑、选择、删除，并把当前 Style 应用于独立文本处理任务
- Style instructions 只保存在本地 settings，history/result 只保存 ID 与名称
- 2026-06-14 已增加主窗口常驻侧栏一键循环切换，并让设置页与侧栏共用 store action
- 当前仍没有 Overlay、托盘动态菜单或独立全局热键快捷切换
- 活跃任务期间侧栏、设置页和 store action 均锁定 Style 变更，避免当前任务快照漂移
- 尚未用真实 Windows 桌面录音和真实 Provider 验证风格效果与重启持久化

下一步：
- 在完成主窗口真机验收后，再设计不与录音热键冲突的全局 Profile 快捷切换入口
- 真机验证 Style 重启恢复、真实润色效果和 history 展示
- 在开始 Agent 模式前继续保持“Style 只影响文本，不执行任务”的边界

### 6.2 独立只读 Agent 入口仍缺真实完成输出与桌面验收

状态：
- 未收口

当前事实：
- 首轮独立 Agent 页面、后端只读 Provider 适配和可取消任务 API 已实现
- Codex CLI/SDK 固定在当前仓库只读运行；Claude Code 首轮禁用工具，只做 prompt-only 回答
- 自动化、静态导入、前端构建、真实 HTTP 启动/取消、Provider readiness，以及 Claude CLI、Codex CLI、Codex SDK 三个本地 Provider 的最小完成输出均已通过
- 当前没有多轮会话、写模式、任意工作目录或 Agent history
- 2026-06-14 新一轮真实页面回归中，Claude CLI 仍可完成并返回 `READY`；Codex CLI 与 Codex SDK 当前因账户 usage limit 无法完成，说明 readiness 的 `ready` 只代表安装就绪，不代表当前配额可执行
- 本轮 Windows Tauri dev 进程已真实启动，但桌面自动化连接因外部 Computer Use 运行时内部导出错误不可用，Tauri 窗口交互仍未验收

下一步：
- 在 Windows Tauri 主窗口分别完成 Claude CLI、Codex CLI、Codex SDK 的真实页面任务；三个 Provider 的后端 API 最小输出均已验证
- Codex 账户配额恢复后重新完成 CLI 与 SDK 页面输出验收
- 验证长任务取消后本次 CLI/SDK 运行时退出，且不影响已有 Codex 会话
- 真实验证输出不进入转写 history、不触发外部文本输入
- 多轮或写模式必须单独设计授权、工作区和审计契约后再实施

### 6.3 Agent 页面轮询与长错误诊断

状态：
- 已收口

当前事实：
- 2026-06-14 发现 Agent 页面在单次任务轮询失败后会清空活动任务 ID，但仍保留 `running` 页面状态，导致后续轮询、取消和清空锁死
- 同一轮审计发现取消成功后，旧的晚到轮询响应可能把 `cancelled` 覆盖回 `running`
- 已改为保留活动任务 ID继续轮询，并在应用轮询响应前核对当前任务身份；确定性 `503 -> completed` 页面 smoke 与真实取消 smoke 均通过
- 真实 Codex CLI usage-limit 回归发现共享短错误只保留前 400 字符，前置 warning 会掩盖末尾根因；已改为长错误同时保留开头和末尾，并新增单元测试

## 5. 记录规则

- 本文件只保留当前仍有协作价值的问题
- 历史问题与完整时间线从 Git 历史查看
