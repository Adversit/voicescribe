# 2026-03-26 实现差距修复清单

更新时间：2026-03-29

上游基线：
- [0325第一阶段改造计划.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\0325第一阶段改造计划.md)
- [2026-03-25-voicescribe-windows-spec.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\2026-03-25-voicescribe-windows-spec.md)
- [2026-03-27-ui-imitation-plan.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\2026-03-27-ui-imitation-plan.md)
- [2026-03-28-rt-history-hotkey-spec.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-rt-history-hotkey\2026-03-28-rt-history-hotkey-spec.md)

本文档不是新的技术方案，只负责记录当前代码与 `plan/spec` 的剩余差距。

## 状态定义
- `已完成`
- `代码已完成，待人工验收`
- `代码已完成，待远端验收`
- `部分完成`
- `未完成`

## 当前总结

已基本收口：
- 后端路径适配
- 模型目录统一到项目根 `models/`
- 所有引擎统一模型管理语义
- Tauri 基础工程与构建链
- 本地启动链与依赖安装脚本

当前主要剩余问题：
- 热键、录音、文本输出仍需人工桌面验收
- 安装态 embedded Python 冷启动仍需最终验收
- GitHub Actions 仍需远端验证
- Windows 开机自启仍需系统侧确认
- 实时转录、历史记录与快捷键录制专题代码已落地，仍需人工专题验收

## Phase 1
- `P1-01` 路径管理统一：`已完成`
- `P1-02` 注册表 rebasing 与自愈：`已完成`

## Phase 2
- `P2-01` Tauri 工程骨架与插件：`已完成`
- `P2-02` TypeScript 类型与默认值：`已完成`

## Phase 3
- `P3-01` 后端子进程与 embedded Python 初始化：`部分完成`
  - 已完成安装态模拟下的运行时目录创建、`backend/` 资源同步、`backend/venv` 创建与 `/health` 启动验证。
  - 当前最小闭环成立，但本轮仍依赖系统 Python 回退来创建 `venv`，不等于真实 embedded payload 已全部验收。
- `P3-02` 全局热键完整行为：`代码已完成，待人工验收`
- `P3-03` 音频录制链路：`代码已完成，待人工验收`
- `P3-04` 文本输出能力：`代码已完成，待人工验收`

## Phase 4
- `P4-01` 主窗口结构与原生 app 对齐：`已完成`
  - 已完成窗口从初始尺寸到放大后的比例稳定性收口。
  - 已完成各页面视觉密度统一与滚动策略收口。
  - 已按人工验收结果确认当前界面方向可接受，不再作为剩余问题继续阻塞。
- `P4-02` 引擎页统一模型语义：`已完成`
- `P4-03` 托盘能力与图标：`代码已完成，待人工验收`
- `P4-04` 实时转录与历史记录专题：`代码已完成，待人工验收`
  - 该专题已拆分到 [2026-03-28-rt-history-hotkey-spec.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-rt-history-hotkey\2026-03-28-rt-history-hotkey-spec.md)
  - 代码层已完成侧边栏新增页面、流式时间线、历史记录存储与下载能力。
  - 本轮自动化验证见 [2026-03-29-rt-history-hotkey-test-report.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-rt-history-hotkey\2026-03-29-rt-history-hotkey-test-report.md)。

## Feature Topic
- `F1-01` 实时转录页：`代码已完成，待人工验收`
  - 已基于 `/stream` 打通说话人时间线展示与 AI 摘要展示区域。
- `F1-02` 历史记录页：`代码已完成，待人工验收`
  - 已支持流式与非流式结果自动入库、复制、下载、删除与清空。
- `F1-03` 通用页流式传输/AI 摘要/保留音频开关：`代码已完成，待人工验收`
  - 已建立字段、默认值与约束关系，`AI 摘要总结` 受 `启用流式传输` 开关约束。
- `F1-04` 快捷键真实录制：`代码已完成，待人工验收`
  - 已替代旧数字 keycode 录入，支持单键、组合键与左右 `Alt` 区分。

## Phase 5
- `P5-01` embedded Python 资源与安装态闭环：`部分完成`
  - 已验证“无内置 embedded payload 时，安装态模拟可退回系统 Python 完成初始化并启动最小后端”。
  - 尚未验证“资源目录携带真实 `python-embed/python.exe` 或 `python-embed.zip` 时”的最终安装态闭环，因此继续保留为 `部分完成`。
- `P5-02` GitHub Actions CI/CD：`代码已完成，待远端验收`
- `P5-03` Windows 自动启动：`代码已完成，待人工验收`

## 当前结论

不能说 spec 已全部完成。当前更准确的状态是：
- 核心代码主链大部分已落地；
- 剩余工作集中在安装态 embedded Python 闭环、人工桌面验收，以及少量交付链路验证。
