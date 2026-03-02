# VoiceScribe 任务计划：选中文本编辑 + 选中文本问答

## 0. 目标与范围

本计划仅覆盖两个能力：

1. `Speak to edit selected text`
- 读取当前应用选中文本
- 根据语音指令生成编辑结果
- 回写替换原选中内容

2. `Ask anything (based on selected text)`
- 读取当前应用选中文本作为上下文
- 接收语音问题
- 返回答案（先在应用内展示，不自动回写）

不包含：
- 全量互联网检索增强
- 多轮会话记忆系统
- 全平台统一输入法级接入（先做 Windows 优先）

---

## 1. 设计原则

1. 先做最小闭环，再做增强能力
2. 所有“读取选区/回写文本”必须可观测（成功/失败状态）
3. 功能降级明确：
- 取不到选区 -> 给出提示，不静默失败
- 回写失败 -> 结果复制到剪贴板并通知用户手动粘贴

---

## 2. 架构改造概览

## 2.1 新增工作模式（前端设置）

在 `AppSettings` 增加：
- `mode: 'dictate' | 'edit_selected' | 'ask_selected'`
- `editCommand: 'rewrite' | 'summarize' | 'polish' | 'custom'`
- `customCommandPrompt?: string`

默认：
- `mode = 'dictate'`（保持现有行为不变）

## 2.2 主进程新增“选区桥接”

新增能力：
- `getSelectedText()`: 模拟 `Ctrl+C` 获取当前选区（带剪贴板恢复）
- `replaceSelectedText(text)`: 写入剪贴板 + 模拟 `Ctrl+V`

IPC：
- `selection-get`
- `selection-replace`

## 2.3 后端新增统一文本处理接口

新增接口（建议）：
- `POST /process_text`

请求：
- `mode: "edit_selected" | "ask_selected"`
- `selected_text: string`
- `instruction?: string`（编辑指令或自定义命令）
- `question?: string`（问答问题）
- `language?: string`

响应：
- `result_text: string`
- `mode: string`
- `meta: { provider, latency_ms }`

实现建议：
- 新增 `backend/postprocess/text_processor.py`
- 先复用已有 `AIRefiner` 的调用习惯；后续再拆 provider abstraction

---

## 3. 分阶段计划

## Phase 1：Speak to edit selected text（MVP）

### 3.1 前端/主进程

1. 设置页新增 Mode 与 Edit Command
- 文件：
  - `frontend/electron/store.ts`
  - `frontend/src/components/settings/GeneralSettings.tsx`（或新增 `CommandSettings.tsx`）

2. 新增 IPC：
- `frontend/electron/main.ts`
- `frontend/electron/preload.ts`

3. 录音完成后分流：
- `mode=dictate`：走现有逻辑
- `mode=edit_selected`：执行
  - 获取选区文本
  - 将“语音转写文本”作为编辑指令
  - 调后端 `/process_text`
  - 回写替换选区

### 3.2 后端

1. 新增 `/process_text` 与 `edit_selected` 分支
- 输入：`selected_text + instruction`
- 输出：`result_text`

2. 最小命令模板
- `rewrite`: 按语义改写，保留原意
- `summarize`: 压缩成简洁版本
- `polish`: 润色语气与语法

### 3.3 验收标准（Phase 1）

1. 任意文本编辑器中选中文本，触发语音编辑后可被替换
2. 失败有显式提示，且结果保底复制到剪贴板
3. `dictate` 模式不回归（原有路径正常）

---

## Phase 2：Ask anything（基于选中文本）

### 4.1 前端/主进程

1. `mode=ask_selected` 分支：
- 获取选区文本
- 语音转写作为 `question`
- 调后端 `/process_text`

2. 结果展示：
- 先在主窗口弹出 Answer Panel（不自动回写）
- 提供按钮：`复制答案`、`插入到当前应用`

### 4.2 后端

1. `/process_text` 增加 `ask_selected` 分支
- 输入：`selected_text + question`
- 输出：`result_text`（答案）

2. 约束输出格式
- 默认简短回答
- 支持可选 `detail_level`（后续可扩展）

### 4.3 验收标准（Phase 2）

1. 选中一段文本后可语音提问并返回答案
2. 答案可复制/可插入
3. 无选区时提供可理解错误提示

---

## 5. 任务拆分（工程执行）

1. 数据结构与设置项
- `store.ts`、`preload` 类型声明、设置 UI

2. 选区桥接能力
- `selection-get`、`selection-replace`
- 剪贴板恢复策略

3. `/process_text` 后端接口
- 路由、请求模型、处理器

4. 录音流程分流
- `GlobalRecordingManager` + `main.ts` 调度改造

5. UI 反馈与错误处理
- Toast/状态提示（成功、失败、回退）

6. 测试
- 手工用例 + 最少 2 条自动化 smoke（edit/ask）

---

## 6. 风险与对策

1. 风险：跨应用选区读取不稳定（焦点/权限/安全策略）
- 对策：明确失败提示 + 剪贴板回退 + 可重试

2. 风险：回写可能误粘贴到错误窗口
- 对策：执行前短暂确认（可配置）；记录 last target window（后续增强）

3. 风险：模型响应慢影响体验
- 对策：UI loading + 超时 + 可取消

---

## 7. 里程碑与交付物

## M1（2-3 天）
- 设置项 + mode 分流骨架 + IPC stub

## M2（3-5 天）
- `edit_selected` 全链路可用
- 回退机制与提示完善

## M3（2-4 天）
- `ask_selected` 全链路可用
- Answer Panel + 复制/插入

## M4（1-2 天）
- smoke 测试 + 文档更新（`memory/*.md`）

---

## 8. Definition of Done

1. 两个模式均可在 Windows 主流编辑器中跑通
2. 任一失败路径都有用户可见反馈
3. 原有 `dictate` 功能无回归
4. 有最小 smoke 测试与操作文档
