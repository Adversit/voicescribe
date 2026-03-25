# 2026-03-25 Phase 1 计划对照表

更新时间：2026-03-25

对照基线：
- [0325第一阶段改造计划.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\0325第一阶段改造计划.md)
- 当前实现代码基线（截至本次会话工作区）

本文档只分析 `Phase 1: 后端跨平台适配` 是否按计划落实，不覆盖 Phase 2-5。

## 结论

结论不是“完全未按计划做”，而是：

- Phase 1 的主干改造大部分已经落地。
- 但执行时没有严格按计划逐项验收，导致出现了“代码做了、口径没收死、测试没覆盖、行为后来才被用户指出”的问题。
- 最明显的偏差集中在：
  - 模型目录口径没有一开始就完全收死
  - 模型状态与下载管理没有一开始覆盖所有引擎
  - 测试验证偏重构建与接口，缺少对计划中行为语义的闭环验证

## 对照矩阵

| 计划项 | 计划要求 | 当前实际情况 | 状态 |
|---|---|---|---|
| 1.1 `backend/config.py` 集中路径管理 | 统一管理项目根、模型、说话人、配置、Whisper.cpp CLI 路径 | 已存在 [config.py](D:\learn\AIGC\voicescribe\0324\voicescribe\backend\config.py)，并统一了 `PROJECT_ROOT`、`MODEL_CACHE_DIR`、`WHISPER_CPP_MODEL_DIR`、`SPEAKER_DATA_DIR`、`CONFIG_DIR`、`find_whisper_cli()`、`ensure_dirs()` | 已完成 |
| 1.1 模型目录策略 | 计划里写的是“默认 `<ROOT>/models/`，允许环境变量覆盖” | 当前实现已被后续口径收紧为“模型统一只认项目根目录 `models/`”，这比原计划更强，但属于偏离原始通用设计 | 偏离但已收口 |
| 1.2 `server.py` 导入 config 模块 | 用 config 替换硬编码 macOS 路径 | 已完成，`server.py` 已统一从 [config.py](D:\learn\AIGC\voicescribe\0324\voicescribe\backend\config.py) 取路径 | 已完成 |
| 1.2 Whisper.cpp 检测函数 | `find_whisper_cli()` + `WHISPER_CPP_MODEL_DIR` | 已完成 | 已完成 |
| 1.2 ModelScope/registry 初始化 | 使用 `MODELSCOPE_CACHE`、`ensure_dirs()`，移除局部硬编码 | 已完成 | 已完成 |
| 1.2 `/load` 中 Whisper.cpp 模型路径 | 改为从运行时模型目录拼接 | 已完成，但后续又继续扩展为优先使用注册表记录的路径 | 已完成 |
| 1.2 FunASR 下载 cache_dir | 改为 `str(MODEL_CACHE_DIR)` | 已完成 | 已完成 |
| 1.2 `/models` 语义 | 原计划主要强调路径迁移，没有展开全部引擎状态来源 | 初期实现只覆盖 FunASR，后续经用户指出才扩展到 Whisper / WhisperCpp / Parakeet | 初期未完成，后续补齐 |
| 1.3 `whispercpp_engine.py` | 默认模型路径和 CLI 路径都来自 config | 已完成 | 已完成 |
| 1.4 `speaker.py` | 默认数据目录改到 `SPEAKER_DATA_DIR` | 已完成，见 [speaker.py](D:\learn\AIGC\voicescribe\0324\voicescribe\backend\diarization\speaker.py) | 已完成 |
| 1.5 `ai_refiner.py` | 配置目录改到 `CONFIG_DIR` | 已完成，见 [ai_refiner.py](D:\learn\AIGC\voicescribe\0324\voicescribe\backend\postprocess\ai_refiner.py) | 已完成 |
| 1.6 向后兼容性保证 | 环境变量优先；macOS 原生继续可用；Windows 开发态默认 `<ROOT>/models/` | 仅部分对齐。路径兼容已做，但后续又根据实际产品口径收紧为“项目根目录 `models/` 唯一真相”，与原计划“更通用的 fallback”不同 | 部分完成 |
| 1.6 历史模型路径兼容 | 计划中未细写 rebasing 细节 | 当前实现额外补了旧注册表路径 rebasing 到当前 `models/`，这是计划外增强 | 已完成并增强 |
| 1.7 Phase 1 测试方案 | 重点验证 Windows 下后端启动、目录自动创建、接口可用 | 实际做了 `python -m compileall backend`、接口验证、目录验证，但没有完全按计划原文执行一次“最小依赖 + `server.py --mock`”闭环 | 部分完成 |

## 关键偏差点

### 1. 计划执行顺序不严

最主要的问题不是某一行代码漏改，而是没有把 `Phase 1` 逐项变成“计划项 -> 验收项 -> 测试项”的强约束。

结果表现为：
- 路径改造先做了
- 但模型状态口径没有一起收死
- 测试更多是在验证“代码能运行”，而不是“计划语义完全落地”

### 2. 模型管理只做了一半

这是本次偏差最大的点。

Phase 1 虽然主题叫“后端跨平台适配”，但在实际产品行为里，模型目录、模型注册表、模型状态、模型下载入口其实是一体的。

初期实现的问题是：
- 只先把 FunASR 模型管理做通
- 其他引擎虽然在 `/engines` 中有模型清单
- 但 `/models`、下载、删除、前端显示逻辑没有同步覆盖

这直接导致后面用户连续指出：
- 可选模型和可下载模型不一致
- 未下载模型不显示
- 其他引擎没有下载/删除语义

### 3. 模型目录口径在实现中途才被彻底统一

原计划更偏“通用路径适配”。
实际产品口径后来被用户明确为：

- 下载到项目根目录 `models/`
- 读取也只从项目根目录 `models/`
- 历史注册表路径 rebasing 到当前 `models/`

也就是说，真正的产品要求比原计划更硬。这个约束不是一开始就被写死，所以中间出现了：
- 桌面端传 runtime 目录
- 后端允许其他目录来源
- 本地模型已存在但系统没识别

### 4. 测试方案执行不完整

Phase 1 的测试原文强调的是：
- Windows 下启动后端
- mock 模式运行
- 自动创建 `models/`、`config/`、`data/speakers/`

实际执行中虽然做了不少验证，但没有一开始就严格按这套原文跑完并签收，因此早期遗漏了：
- 模型路径识别问题
- 历史注册表路径问题
- 全部引擎模型状态口径问题

## 哪些内容是“按计划做了”，哪些是“后补”的

### 按计划主线完成的

- `config.py` 集中路径管理
- `server.py` 去除大部分 macOS 路径硬编码
- `whispercpp_engine.py` 路径适配
- `speaker.py` 默认数据目录适配
- `ai_refiner.py` 配置目录适配

### 后续由用户指出后才补齐的

- 模型目录只认项目根目录 `models/`
- 注册表旧路径 rebasing
- `/models` 不只返回 FunASR，而是返回所有引擎
- 其他引擎的下载与删除逻辑
- 前端未下载模型的补全显示

## 根因总结

本阶段没有完全按计划执行，根因不是“计划写错了”，而是：

1. 把计划当成方向文档，而不是逐项验收清单。
2. 先进入实现，再反过来补 spec 与测试。
3. 过度依赖构建通过和接口可返回，低估了模型管理这种“口径一致性”问题。
4. 没有在 Phase 1 就建立“后端模型目录、状态、下载、删除、前端展示”是一整套语义的意识。

## 后续约束建议

后续继续推进时，建议强制执行以下规则：

1. 每个 phase 先写“实现约束 + 验收条件”，再写代码。
2. 每个功能必须同时定义：
   - 数据来源
   - 展示口径
   - 用户动作
   - 删除/失败/回退行为
3. 测试文档不能只记录“编译通过”，还要记录“计划语义是否闭环”。
