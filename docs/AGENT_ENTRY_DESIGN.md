# VoiceScribe 独立只读 Agent 入口设计

更新时间：2026-06-14

## 1. 目标与边界

VoiceScribe 增加一个与语音转写、文本润色相互隔离的 Agent 页面，用于调用本机 Claude Code、Codex CLI 或 Codex SDK 的无头模式。

首轮只提供单轮、可取消、只读任务：

- Codex CLI 和 Codex SDK 可在当前 VoiceScribe 仓库根目录执行只读分析。
- Claude Code 使用禁用工具的无头模式，只能根据用户输入回答，首轮不读取仓库文件。
- Agent 不写文件、不执行任意工具、不请求授权、不接受任意工作目录。
- Agent 输出不进入转写结果、外部文本输出、Style Profile 或 history。
- Agent 不触发模型下载；Provider 环境仍把模型与缓存固定在 `<repo>/models/`。

## 2. Single Source Of Truth

后端 `AgentTaskService` 是 Agent 任务生命周期的唯一事实源。前端只提交请求并轮询任务快照；`AgentService` 负责 Provider 命令、安全参数、仓库目录和模型缓存环境；`server.py` 只定义薄路由与请求映射。任务首轮只保存在内存，不持久化。

## 3. 输入与输出契约

`POST /agent/tasks` 输入 `prompt`、`provider`、`model` 和 `timeout_seconds`。

- `prompt` 去除首尾空白后必须非空，最大 20000 字符。
- `provider` 仅允许 `claude_cli`、`codex_cli`、`codex_sdk`。
- `model` 最大 200 字符。
- `timeout_seconds` 限制在 5 到 600 秒。
- 工作目录不由客户端提交，固定为后端配置的 `PROJECT_ROOT`。

任务结果包含 `output`、`provider`、`model`、`workspace`、`capability` 和 `duration_ms`。任务状态仅允许 `pending`、`running`、`completed`、`cancelled`、`failed`。`DELETE /agent/tasks/{task_id}` 取消任务，终态取消保持幂等。

## 4. Provider 安全契约

| Provider | 首轮能力 | 安全参数 |
|---|---|---|
| Claude Code CLI | `prompt_only` | `--print`、无 session、safe mode、禁用 slash commands、`--tools ""` |
| Codex CLI | `workspace_read_only` | `exec --ephemeral --sandbox read-only`，保留仓库规则 |
| Codex SDK | `workspace_read_only` | `approval_mode=deny_all`、`sandbox=read_only`、`ephemeral=true` |

所有 Provider 使用 stdin 传递 prompt；Windows 子进程隐藏运行；取消时终止 CLI 进程树或中断 SDK turn；Provider 环境中的模型与缓存路径均位于 `<repo>/models/`。

## 5. Affected File List

- `docs/AGENT_ENTRY_DESIGN.md`
- `docs/PRD.md`
- `docs/SPEC.md`
- `docs/TEST.md`
- `docs/BUGS.md`
- `backend/services/agent_service.py`
- `backend/services/agent_task_service.py`
- `backend/server.py`
- `backend/tests/test_agent_service.py`
- `backend/tests/test_agent_task_service.py`
- `backend/tests/test_pipeline_routes.py`
- `tauri-app/src/types/index.ts`
- `tauri-app/src/api/backend.ts`
- `tauri-app/src/stores/appStore.ts`
- `tauri-app/src/components/Layout.tsx`
- `tauri-app/src/shell/AppShell.tsx`
- `tauri-app/src/pages/AgentPage.tsx`

## 6. Affected Runtime Paths

- `AgentPage.tsx -> backend.ts -> POST /agent/tasks -> server.py -> AgentTaskService -> AgentService -> Claude/Codex runtime`
- `AgentPage.tsx -> backend.ts -> GET /agent/tasks/{id} -> AgentTaskService`
- `AgentPage.tsx -> backend.ts -> DELETE /agent/tasks/{id} -> AgentTaskService -> CLI process tree / SDK interrupt`

## 7. Affected Persisted Objects

- settings：首轮不新增 Agent 设置持久化。
- model registry：不修改。
- history records：不写入 Agent 任务或输出。
- transcription result objects：不修改。
- token storage：不修改，不把 token 放入请求或结果。
- logs：只记录 Provider、状态、耗时和字符数，不记录完整 prompt/output。

## 8. Old-Logic Removal List

首轮没有需要删除的已发布 Agent 旧逻辑。实施时禁止复用 `TextProcessingService.process()`、转写 history、录音 pipeline 或 `--ignore-rules`，也禁止从客户端接受工作目录。

## 9. 失败分支

- 空 prompt 或不支持的 Provider：请求返回 422。
- CLI/SDK 缺失、Provider 超时或配额失败：任务进入 `failed` 并返回不超过 400 字符的短错误；长错误必须同时保留开头上下文和末尾根因，避免前置 warning 掩盖真实失败。
- 用户取消：任务立即固定为 `cancelled`，迟到结果不得发布。
- 应用退出：取消全部非终态 Agent 任务。
- 后端未就绪：前端显示现有后端不可用错误。
- 活跃任务轮询发生瞬时读取失败：前端保留活动任务 ID、显示临时错误并继续轮询；下一次成功读取后清除临时错误。前端不得因单次读取失败伪造 `failed` 终态。
- 取消或终态更新后收到旧轮询响应：前端按活动任务 ID 丢弃晚到响应，不得把 `cancelled` 或其他终态覆盖回 `running`。
- 页面卸载：停止轮询，不自动取消已启动任务。

## 10. Acceptance Criteria

- 用户可从独立 Agent 页面启动三个本地无头 Provider。
- 页面明确展示 Claude `prompt_only` 与 Codex `workspace_read_only` 的能力差异。
- 任务可轮询、取消，并展示输出或短错误。
- 长 Provider 错误不会只显示前置 warning，页面可看到末尾真实失败原因。
- 活跃任务单次轮询失败后仍可继续轮询和取消，恢复成功时错误提示自动清除。
- 取消后的晚到轮询响应不会覆盖取消终态。
- Agent 输出不写入转写 history，不触发外部文本输出。
- Codex CLI/SDK 只读且不请求授权；Claude 不启用工具。
- 所有模型和缓存环境仍指向 `<repo>/models/`。
- 后端自动化测试、静态导入和前端生产构建通过。
- Windows 真实 Provider 调用作为单独人工验收项记录。
