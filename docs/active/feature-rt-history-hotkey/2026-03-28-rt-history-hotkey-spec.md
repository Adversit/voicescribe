# 实时转录、历史记录与快捷键录制专题 Spec

## 2026-03-29 快捷键状态机调整

- 删除“快速双击开始 / 快速双击停止”的状态分支。
- 保留长按定时器，但仅在空闲态按住超过阈值时进入长按模式并开始录音。
- 非长按场景改为单次完整按压切换：空闲态单击开始，录音态单击停止并转录。
- 长按模式下仅在松开时停止；长按释放不能再落入单击切换分支。
- Esc 取消逻辑不变。

更新时间：2026-03-28

上游文档：
- [专题需求文档](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-rt-history-hotkey\2026-03-28-rt-history-hotkey-requirements.md)
- [0325第一阶段改造计划.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\0325第一阶段改造计划.md)
- [2026-03-25-voicescribe-windows-spec.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\2026-03-25-voicescribe-windows-spec.md)
- [2026-03-27-ui-imitation-plan.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\2026-03-27-ui-imitation-plan.md)

## 1. 目标

本专题在当前 Windows 主窗口内新增：
- `实时转录` 页面
- `历史记录` 页面

并补齐：
- 通用页中的 `启用流式传输`、`AI 摘要总结`、`保留音频`
- 快捷键页中的真实按键录制能力

本专题必须遵守现有主窗口约束：
- 单层主表面
- 侧边栏 + 原生设置页
- 页面风格统一

## 2. 分层设计

本专题严格按三层实现：

### 2.1 前端层

负责：
- 页面展示
- 用户交互
- 页面级状态切换

不负责：
- 直接处理原始流式协议
- 直接决定历史记录持久化细节
- 直接做底层键盘录制逻辑

### 2.2 桌面调配层

由 Tauri/Rust + 前端状态层共同承担。

负责：
- `/stream` 连接桥接与事件聚合
- 实时片段状态管理
- 历史记录业务流程编排
- 快捷键录制状态机
- AI 摘要的触发编排

这是本专题的核心调度层。

### 2.3 后端层

继续负责：
- `/stream`
- `/transcribe`
- 历史记录 API 与数据存储
- 模型与说话人能力
- 现有 AI 优化能力

后端提供原始能力与历史记录存储接口，桌面调配层决定桌面端如何触发、组织和展示。

## 3. 页面扩展

当前侧边栏页面从 5 项扩展为 7 项：
- `general`
- `engine`
- `realtime`
- `history`
- `vocabulary`
- `speaker`
- `hotkey`

要求：
- 新页面与现有页面沿用同一套布局骨架
- 不新增新的外层 panel 语义

## 4. 通用页扩展

## 4.1 新增设置字段

`AppSettings` 需要新增至少以下字段：
- `enableStreaming: boolean`
- `enableAISummary: boolean`
- `retainAudio: boolean`

默认值：
- `enableStreaming = false`
- `enableAISummary = false`
- `retainAudio = false`

### 4.2 约束关系

- 当 `enableStreaming = false` 时：
  - `enableAISummary` 在界面上不可开启
  - 桌面调配层不建立流式转录链路

- 当 `enableStreaming = true` 且 `enableAISummary = true` 时：
  - 桌面调配层按时间窗口触发 AI 摘要
  - 当前窗口期口径为约每 2 分钟一次

## 5. 实时转录页

### 5.1 数据模型

建议新增：

`RealtimeEntry`
- `id`
- `speaker`
- `text`
- `timestamp`
- `segments?`

`RealtimeSummary`
- `id`
- `createdAt`
- `text`

`RealtimeSessionState`
- `status: idle | recording | streaming | completed | error`
- `entries: RealtimeEntry[]`
- `summaries: RealtimeSummary[]`

### 5.2 数据来源

实时转录页的数据必须来自 `/stream`，但页面不能直接消费原始流事件。

流程：
1. 后端输出 `/stream` 原始结果
2. 桌面调配层解析并聚合
3. 当一个说话人片段完成后，生成一条稳定的 `RealtimeEntry`
4. 前端实时转录页追加展示

### 5.3 展示规则

每条片段只显示：
- 说话人名
- 文本
- 时间戳

不要求逐字打字机效果。

页面的核心体验是“片段落地时间线”，不是逐字滚动框。

### 5.4 AI 摘要

当 `enableAISummary = true` 时：
- 桌面调配层定期对流式会话内容触发摘要
- 摘要写入实时转录页摘要区域
- 同时写入历史记录详情

## 6. 历史记录页

### 6.1 记录粒度

历史记录按整次任务存一条，不按说话人拆条。

建议数据模型：

`HistoryRecord`
- `id`
- `createdAt`
- `mode: stream | non-stream`
- `text`
- `duration`
- `engine`
- `model`
- `speakerEntries`
- `summary`
- `retainAudio`
- `audioPath`

### 6.2 数据来源

历史记录需统一记录两类任务：
- 流式任务
- 非流式任务

要求：
- 当启用流式传输后，历史记录自动收集 `stream` 与 `non-stream`
- `stream` 可带 AI 摘要
- `non-stream` 不生成 AI 摘要

### 6.3 存储口径

历史记录主表由后端维护，桌面调配层不再直接承担最终落盘。

落盘位置：
- 应位于后端运行时可写目录
- 不能依赖安装目录可写

建议后端存储：
- `history.json` 或等价结构化文件
- 仅保存元数据与文本
- 音频文件是否保留由 `retainAudio` 决定

建议后端接口：
- `GET /history`
- `POST /history`
- `DELETE /history/{record_id}`
- `DELETE /history`
- `GET /history/{record_id}/download/text`
- `GET /history/{record_id}/download/audio`

桌面调配层职责：
- 在流式和非流式任务完成时组织记录并调用新增接口
- 在页面中调用查询、删除、清空、下载接口
- 对流式片段进行聚合，再提交整次任务记录

### 6.4 页面能力

每条记录必须支持：
- 复制文本
- 下载文本
- 下载音频
- 删除单条

页面必须支持：
- 清空全部记录

如果 `retainAudio = false` 或记录无音频：
- “下载音频”按钮禁用或明确提示不可用

## 7. 快捷键录制功能

### 7.1 数据模型

建议新增录制态：

`HotkeyCaptureState`
- `idle`
- `recording`
- `captured`
- `saving`
- `error`

### 7.2 行为

交互流程：
1. 用户点击“录制快捷键”
2. 界面进入监听状态
3. 桌面调配层捕获真实按键
4. 规范化为显示值与存储值
5. 前端预览结果
6. 用户确认保存或重新录制

### 7.3 能力要求

- 支持单键
- 支持组合键
- 区分左右 `Alt`
- 不再依赖手工输入 keycode

### 7.4 存储

现有设置项可继续保留：
- `hotkeyModifiers`
- `hotkeyKeyCode`

如需支持左右修饰键精细区分，需补充更完整的键位描述字段，例如：
- `hotkeyPrimaryKey`
- `hotkeyModifiersDetailed`
- `hotkeyDisplay`

## 8. 页面样式要求

### 8.1 实时转录页

- 采用时间线式单列布局
- 片段卡片应轻量，不做厚重卡片堆叠
- 摘要区域与片段区分层，但仍保持单层主表面风格

### 8.2 历史记录页

- 左侧或顶部可提供轻量筛选：全部 / 流式 / 非流式
- 主列表优先显示任务概览
- 详情区展示全文、说话人片段、摘要与下载操作

### 8.3 快捷键页

- 录制控件应明显替代原数字输入框
- 当前快捷键显示应突出
- 说明区应保留，但压缩到原生设置页密度

## 9. 测试策略

### 9.1 我可以执行的测试

- 数据模型与状态层构建验证
- `npm run build`
- `cargo check`
- `/stream` 桥接逻辑测试
- 历史记录持久化、删除、清空、导出测试
- 快捷键录制状态机代码测试

### 9.2 需要人工验收的测试

- 实时转录页实际效果
- AI 摘要节奏与可读性
- 历史记录操作体验
- 快捷键录制真实键盘体验
- 左右 `Alt` 区分是否符合预期

### 9.3 文档规则

没有写进 [第一阶段测试.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\第一阶段测试.md) 的，一律视为没测。

## 10. 回写主文档要求

本专题完成后，必须回写：
- [2026-03-25-voicescribe-windows-spec.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\2026-03-25-voicescribe-windows-spec.md)
- [2026-03-26-implementation-gap-checklist.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\2026-03-26-implementation-gap-checklist.md)

回写内容至少包括：
- 新增专题索引
- 页面扩展
- 新增设置项
- 新增测试与验收项
