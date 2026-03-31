# VoiceScribe 当前阶段状态

更新时间：2026-03-31

## 1. 本次归档结论

`docs/active/` 之前堆放的是 Phase 1 迁移与收口过程文档。
截至 2026-03-31，这批文档大部分已经进入“已实现、已测试、待尾项验收”状态，不再适合作为当前目录的主入口。

因此本次做了两件事：
1. 把 Phase 1 的 plan / spec / checklist / UI 计划 / 测试 / bug log / 专题文档整体移入 `docs/archive/phase1/`
2. 把 `docs/active/` 收敛为“当前协作规则 + 当前阶段状态入口”

## 2. 当前 Active 文档职责

当前 `docs/active/` 只保留：
- [协作约定.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\协作约定.md)
- [2026-03-31-phase-status.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\2026-03-31-phase-status.md)

含义是：
- `active` 只放当前仍会持续改写的入口文档
- 已完成阶段的历史设计与验收记录进入 `archive`

## 3. Phase 1 归档入口

Phase 1 归档目录：
- [phase1/](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\archive\phase1)

其中主要文档：
- [0325第一阶段改造计划.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\archive\phase1\0325第一阶段改造计划.md)
- [2026-03-25-voicescribe-windows-spec.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\archive\phase1\2026-03-25-voicescribe-windows-spec.md)
- [2026-03-26-implementation-gap-checklist.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\archive\phase1\2026-03-26-implementation-gap-checklist.md)
- [2026-03-27-ui-imitation-plan.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\archive\phase1\2026-03-27-ui-imitation-plan.md)
- [第一阶段测试.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\archive\phase1\第一阶段测试.md)
- [2026-03-25-session-bug-log.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\archive\phase1\2026-03-25-session-bug-log.md)
- [feature-rt-history-hotkey/](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\archive\phase1\feature-rt-history-hotkey)
- [feature-overlay-recording/](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\archive\phase1\feature-overlay-recording)

## 4. 当前真实状态

Phase 1 不能表述为“完全结束”，更准确的说法是：
- 主体实现基本落地
- 大部分过程文档已完成历史归档条件
- 剩余工作主要是尾项验收和最终交付链路

当前仍未完全收口的内容：
- 热键、录音、文本输出、托盘等 Windows 桌面真实体验的人工作业验收
- Windows 自动启动的系统侧确认
- GitHub Actions 的远端验收
- embedded Python 真实 payload、安装态冷启动、最终封装与安装包验收

## 5. 后续文档规则

后续继续工作时，按下面规则执行：

1. 如果只是补 Phase 1 尾项：
   - 继续参考 `docs/archive/phase1/` 下的原 plan/spec/checklist
   - 测试结果继续补写到 [第一阶段测试.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\archive\phase1\第一阶段测试.md)
   - 新 bug 继续补写到 [2026-03-25-session-bug-log.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\archive\phase1\2026-03-25-session-bug-log.md)

2. 如果开始新阶段：
   - 在 `docs/active/` 新建该阶段自己的 plan/spec/checklist/test/bug 文档
   - 不再把新阶段内容混写进 Phase 1 归档文档

3. `docs/README.md` 只维护目录级入口，不再把 `active` 当作长期历史仓库
