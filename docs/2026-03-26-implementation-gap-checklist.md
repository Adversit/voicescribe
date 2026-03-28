# 2026-03-26 实现差距修复清单

更新时间：2026-03-28

上游基线：
- [0325第一阶段改造计划.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\0325第一阶段改造计划.md)
- [2026-03-25-voicescribe-windows-spec.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\2026-03-25-voicescribe-windows-spec.md)
- [2026-03-27-ui-imitation-plan.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\2026-03-27-ui-imitation-plan.md)

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
- `P4-01` 仍需继续收口窗口行为和页面视觉统一性
- 热键、录音、文本输出仍需人工桌面验收
- 安装态 embedded Python 冷启动仍需最终验收
- GitHub Actions 仍需远端验证
- Windows 开机自启仍需系统侧确认

## Phase 1
- `P1-01` 路径管理统一：`已完成`
- `P1-02` 注册表 rebasing 与自愈：`已完成`

## Phase 2
- `P2-01` Tauri 工程骨架与插件：`已完成`
- `P2-02` TypeScript 类型与默认值：`已完成`

## Phase 3
- `P3-01` 后端子进程与 embedded Python 初始化：`部分完成`
- `P3-02` 全局热键完整行为：`代码已完成，待人工验收`
- `P3-03` 音频录制链路：`代码已完成，待人工验收`
- `P3-04` 文本输出能力：`代码已完成，待人工验收`

## Phase 4
- `P4-01` 主窗口结构与原生 app 对齐：`部分完成`
  - 需继续确认窗口放大时的比例稳定性。
  - 需继续收口各页的视觉密度与滚动策略。
  - 本轮已将 `Layout.tsx`、`globals.css`、`GeneralSettings.tsx` 收回主窗口主表面 + 单列通用页方向。
- `P4-02` 引擎页统一模型语义：`已完成`
- `P4-03` 托盘能力与图标：`代码已完成，待人工验收`

## Phase 5
- `P5-01` embedded Python 资源与安装态闭环：`部分完成`
- `P5-02` GitHub Actions CI/CD：`代码已完成，待远端验收`
- `P5-03` Windows 自动启动：`代码已完成，待人工验收`

## 当前结论

不能说 spec 已全部完成。当前更准确的状态是：
- 核心代码主链大部分已落地；
- 剩余工作集中在 `P4-01` 的继续打磨、人工桌面验收，以及少量交付链路验证。