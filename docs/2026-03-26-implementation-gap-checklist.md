# 2026-03-26 实现差距修复清单

更新时间：2026-03-26

上游基线：
- [0325第一阶段改造计划.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\0325第一阶段改造计划.md)
- [2026-03-25-voicescribe-windows-spec.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\2026-03-25-voicescribe-windows-spec.md)
- [2026-03-26-plan-spec-consistency-check.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\2026-03-26-plan-spec-consistency-check.md)

本文档不是新的技术方案，也不是新的 source of truth。
本文档只负责回答一件事：当前代码距离 plan/spec 还差什么，接下来该按什么顺序修。

## 使用口径

参考优先级固定如下：
1. [0325第一阶段改造计划.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\0325第一阶段改造计划.md)
2. [2026-03-25-voicescribe-windows-spec.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\2026-03-25-voicescribe-windows-spec.md)
3. 本差距修复清单

因此：
- 改代码时参考的技术方案是 `plan + spec`
- 本清单只是把 `plan/spec -> 当前代码` 的缺口拆成执行项
- 如果本清单和 spec 冲突，应更新本清单，而不是绕过 spec 改代码

## 状态定义

- `已完成`：代码、行为和对应测试都已经达到 plan/spec 要求
- `部分完成`：主干代码已在，但行为、边界或测试还不完整
- `未完成`：当前仓库里还没有完整实现
- `待人工验收`：代码链路已具备，但桌面交互仍需人工确认

## Phase 1 差距项

### P1-01 路径管理统一收口

- 计划/Spec 要求：
  - 后端路径集中到 [config.py](D:\learn\AIGC\voicescribe\0324\voicescribe\backend\config.py)
  - 模型只认项目根目录 [models](D:\learn\AIGC\voicescribe\0324\voicescribe\models)
- 当前代码现状：
  - [config.py](D:\learn\AIGC\voicescribe\0324\voicescribe\backend\config.py) 已存在
  - [server.py](D:\learn\AIGC\voicescribe\0324\voicescribe\backend\server.py)、[speaker.py](D:\learn\AIGC\voicescribe\0324\voicescribe\backend\diarization\speaker.py)、[ai_refiner.py](D:\learn\AIGC\voicescribe\0324\voicescribe\backend\postprocess\ai_refiner.py) 已接入
- 差距：
  - 需要补一轮回归，确认不存在遗漏的旧路径引用
- 当前判断：`部分完成`
- 要改的文件：
  - [config.py](D:\learn\AIGC\voicescribe\0324\voicescribe\backend\config.py)
  - [server.py](D:\learn\AIGC\voicescribe\0324\voicescribe\backend\server.py)
  - [whispercpp_engine.py](D:\learn\AIGC\voicescribe\0324\voicescribe\backend\engines\whispercpp_engine.py)
  - [speaker.py](D:\learn\AIGC\voicescribe\0324\voicescribe\backend\diarization\speaker.py)
  - [ai_refiner.py](D:\learn\AIGC\voicescribe\0324\voicescribe\backend\postprocess\ai_refiner.py)
- 验收标准：
  - 仓库内不再依赖 macOS 硬编码路径
  - Windows 开发态运行时，模型状态只从项目根目录 `models/` 读取
- 测试方式：
  - `python -m compileall backend`
  - 搜索旧路径字符串
  - `/models` 与本地 `models/voicescribe_models.json` 对照
- Worktree 建议：否

### P1-02 模型注册表 rebasing 与自愈

- 计划/Spec 要求：
  - 历史旧绝对路径统一 rebasing 到当前 `models/`
  - 本地已有模型时，不应因为旧注册表路径而显示未下载
- 当前代码现状：
  - [server.py](D:\learn\AIGC\voicescribe\0324\voicescribe\backend\server.py) 已做旧路径 rebasing
- 差距：
  - 还缺“坏注册表文件、半下载目录、孤儿目录”的系统测试
- 当前判断：`部分完成`
- 要改的文件：
  - [server.py](D:\learn\AIGC\voicescribe\0324\voicescribe\backend\server.py)
  - [第一阶段测试.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\第一阶段测试.md)
- 验收标准：
  - 旧路径记录能自动映射到当前 `models/`
  - 无效路径不会长期污染状态
- 测试方式：
  - 手工构造旧注册表内容
  - 启动后检查 `/models`
- Worktree 建议：是，`wt/model-management`

## Phase 2 差距项

### P2-01 Tauri 工程骨架完整性

- 计划/Spec 要求：
  - [tauri-app](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app) 具备 React/Vite/Tauri/Rust 基本结构
- 当前代码现状：
  - 主骨架已建立
  - [tauri.conf.json](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\tauri.conf.json)、[Cargo.toml](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\Cargo.toml)、页面和 stores 已存在
- 差距：
  - `tauri-plugin-store`、`tauri-plugin-clipboard-manager`、`tauri-plugin-global-shortcut` 仍需核对是否按 plan 全量接入，而不是只在 spec 中声明
- 当前判断：`部分完成`
- 要改的文件：
  - [Cargo.toml](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\Cargo.toml)
  - [lib.rs](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\src\lib.rs)
  - [tauri.conf.json](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\tauri.conf.json)
- 验收标准：
  - 依赖与插件声明和 plan/spec 一致
  - 缺失插件不再靠替代实现隐式绕过
- 测试方式：
  - `cargo check`
  - 人工核对配置项
- Worktree 建议：否

### P2-02 TypeScript 类型与默认值映射

- 计划/Spec 要求：
  - 类型定义和默认值需对齐原始 app 行为
- 当前代码现状：
  - [index.ts](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src\types\index.ts) 已存在
- 差距：
  - 还缺一份“Swift AppState -> TypeScript types/defaults”逐字段映射
- 当前判断：`部分完成`
- 要改的文件：
  - [index.ts](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src\types\index.ts)
  - [appStore.ts](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src\stores\appStore.ts)
  - [第一阶段测试.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\第一阶段测试.md)
- 验收标准：
  - 默认引擎、模型、语言、输出方式、快捷键全部可追溯到 plan/spec
- 测试方式：
  - 新用户配置启动验证
  - 重启后恢复验证
- Worktree 建议：是，`wt/docs-and-tests`

## Phase 3 差距项

### P3-01 后端子进程与嵌入式 Python 初始化

- 计划/Spec 要求：
  - 支持 embedded Python 方案
  - 首次启动可完成环境准备
- 当前代码现状：
  - [backend.rs](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\src\commands\backend.rs) 已有 `python-embed` 查找逻辑
  - 仓库中尚未看到正式的 `src-tauri/resources/python-embed/`
- 差距：
  - 资源目录未正式纳入仓库
  - 首次启动自动初始化流程未按 plan 完整落地
- 当前判断：`未完成`
- 要改的文件：
  - [backend.rs](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\src\commands\backend.rs)
  - [tauri.conf.json](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\tauri.conf.json)
  - `tauri-app/src-tauri/resources/python-embed/`
  - [scripts](D:\learn\AIGC\voicescribe\0324\voicescribe\scripts)
- 验收标准：
  - 安装态不存在预装 venv 时，应用仍可引导完成初始化
- 测试方式：
  - 清空环境后首次启动测试
  - 安装包冷启动测试
- Worktree 建议：否

### P3-02 全局热键完整行为

- 计划/Spec 要求：
  - 长按开始/松开结束
  - 双击切换
  - `ESC` 取消
  - 350ms 阈值
- 当前代码现状：
  - [hotkey.rs](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\src\commands\hotkey.rs) 与 [useHotkey.ts](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src\hooks\useHotkey.ts) 已存在
- 差距：
  - 真实桌面交互还缺端到端验收
  - 计划中的能力边界和降级策略还没形成测试结论
- 当前判断：`待人工验收`
- 要改的文件：
  - [hotkey.rs](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\src\commands\hotkey.rs)
  - [useHotkey.ts](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src\hooks\useHotkey.ts)
- 验收标准：
  - 与 macOS 版行为一致
- 测试方式：
  - 人工桌面验收
  - 辅助日志输出
- Worktree 建议：是，`wt/phase3-hotkey`

### P3-03 音频录制链路

- 计划/Spec 要求：
  - 16kHz、单声道、16-bit PCM WAV
  - 实时音量
  - 取消时删除录音文件
- 当前代码现状：
  - [audio.rs](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\src\commands\audio.rs) 已存在
- 差距：
  - 真实设备录音和音量回调仍缺端到端验收
- 当前判断：`待人工验收`
- 要改的文件：
  - [audio.rs](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\src\commands\audio.rs)
  - [RecordingOverlay.tsx](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src\components\RecordingOverlay.tsx)
- 验收标准：
  - 输出 WAV 参数符合要求
  - 取消录音后临时文件被清理
- 测试方式：
  - 人工录音
  - 检查生成 WAV 参数
- Worktree 建议：是，`wt/phase3-audio`

### P3-04 文本输出能力

- 计划/Spec 要求：
  - `clipboard`
  - `directInput`
  - `both`
  - 记录和恢复前台窗口
- 当前代码现状：
  - [text_input.rs](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\src\commands\text_input.rs) 已存在
- 差距：
  - 外部应用粘贴和前台窗口恢复仍缺人工验收
- 当前判断：`待人工验收`
- 要改的文件：
  - [text_input.rs](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\src\commands\text_input.rs)
  - [GeneralSettings.tsx](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src\pages\GeneralSettings.tsx)
- 验收标准：
  - 三种输出模式都可用
  - 当前台窗口是本应用时，正确回退为剪贴板模式
- 测试方式：
  - 人工在外部编辑器中验证
- Worktree 建议：是，`wt/phase3-text-input`

## Phase 4 差距项

### P4-01 主窗口结构与原始 app 对齐

- 计划/Spec 要求：
  - 与 [app](D:\learn\AIGC\voicescribe\0324\voicescribe\app) 保持结构和体验一致
  - 不退化成后台管理页
- 当前代码现状：
  - 已做一轮对齐，但用户仍明确反馈界面体验暂不满意
- 差距：
  - 结构收敛了一部分，视觉和交互节奏还未完成最终收敛
- 当前判断：`部分完成`
- 要改的文件：
  - [Layout.tsx](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src\components\Layout.tsx)
  - [ShellHeader.tsx](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src\components\ShellHeader.tsx)
  - 各设置页文件
- 验收标准：
  - 页面结构、分组、状态区和录音状态表达与原始 app 一致
- 测试方式：
  - 人工对照 [app](D:\learn\AIGC\voicescribe\0324\voicescribe\app)
- Worktree 建议：否

### P4-02 引擎页统一模型语义

- 计划/Spec 要求：
  - `/engines` 提供完整清单
  - `/models` 提供状态
  - 所有引擎统一“完整模型清单 + 状态叠加”展示
- 当前代码现状：
  - 后端已扩到所有引擎
  - 前端已去掉只针对 `funasr` 的特判
- 差距：
  - 还需要一轮真实下载/删除验证，确认 UI 状态刷新稳定
- 当前判断：`部分完成`
- 要改的文件：
  - [server.py](D:\learn\AIGC\voicescribe\0324\voicescribe\backend\server.py)
  - [EngineSettings.tsx](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src\pages\EngineSettings.tsx)
  - [modelStore.ts](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src\stores\modelStore.ts)
- 验收标准：
  - 未下载模型可见
  - 下载后转为已就绪
  - 删除后回到未下载
  - 所有引擎语义一致
- 测试方式：
  - `/models/download`
  - `/models/delete`
  - 页面刷新验证
- Worktree 建议：是，`wt/model-management`

### P4-03 托盘能力与图标

- 计划/Spec 要求：
  - 主窗口关闭时隐藏到托盘
  - 托盘图标可见
  - 左键恢复主窗口
  - 菜单至少有“显示主窗口”和“退出”
- 当前代码现状：
  - [lib.rs](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\src\lib.rs) 已有关闭隐藏和托盘逻辑
- 差距：
  - 托盘图标与桌面表现仍需人工最终确认
- 当前判断：`待人工验收`
- 要改的文件：
  - [lib.rs](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\src\lib.rs)
  - [tauri.conf.json](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\tauri.conf.json)
  - [icons](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\icons)
- 验收标准：
  - 托盘图标可见且交互符合 spec
- 测试方式：
  - 人工桌面验收
- Worktree 建议：否

## Phase 5 差距项

### P5-01 嵌入式 Python 资源与打包闭环

- 计划/Spec 要求：
  - 打包采用 `python-embed`
  - 首次运行自动创建后端虚拟环境
- 当前代码现状：
  - 查找逻辑已在 [backend.rs](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\src\commands\backend.rs)
  - 仓库中尚无正式资源目录
- 差距：
  - 打包闭环未完成
- 当前判断：`未完成`
- 要改的文件：
  - [backend.rs](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\src\commands\backend.rs)
  - [tauri.conf.json](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\tauri.conf.json)
  - `tauri-app/src-tauri/resources/python-embed/`
- 验收标准：
  - 干净机器安装后可完成初始化
- 测试方式：
  - 安装包冷启动测试
- Worktree 建议：否

### P5-02 CI/CD 工作流

- 计划/Spec 要求：
  - 提供 Windows 构建 GitHub Actions
- 当前代码现状：
  - 仓库根目录没有 `.github/workflows`
- 差距：
  - 完整缺失
- 当前判断：`未完成`
- 要改的文件：
  - `.github/workflows/build-windows.yml`
- 验收标准：
  - push/tag 后可自动构建 NSIS 安装包并上传产物
- 测试方式：
  - GitHub Actions 运行验证
- Worktree 建议：是，`wt/docs-and-tests`

### P5-03 自动启动实现口径

- 计划/Spec 要求：
  - Windows 自动启动必须按 Windows 方案实现
  - 不能停留在 macOS 语义
- 当前代码现状：
  - 当前仓库未看到正式的 Windows autostart 落地
- 差距：
  - 功能本身尚未完成
- 当前判断：`未完成`
- 要改的文件：
  - [lib.rs](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\src\lib.rs)
  - 可能新增 autostart 相关模块或安装脚本
- 验收标准：
  - 开启自动启动后，Windows 重启后可按预期拉起应用
- 测试方式：
  - 手工系统重启或启动项验证
- Worktree 建议：否

## 建议执行顺序

1. 先收口 `P1-01`、`P1-02`、`P4-02`
原因：模型目录和模型管理语义是当前最高优先级产品口径。

2. 再处理 `P3-01`、`P5-01`
原因：这是安装态闭环的关键阻塞项。

3. 再补 `P5-02`、`P5-03`
原因：这两项属于交付链路和系统集成层。

4. 最后做 `P4-01` 的界面最终收敛
原因：这是体验层收尾，不应反过来阻塞底层闭环。

## 与测试文档的关系

每完成一个差距项，都必须同步更新：
- [第一阶段测试.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\第一阶段测试.md)

如果修复过程出现新的偏差、反复修复或口径误解，还必须同步更新：
- [2026-03-25-session-bug-log.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\2026-03-25-session-bug-log.md)
