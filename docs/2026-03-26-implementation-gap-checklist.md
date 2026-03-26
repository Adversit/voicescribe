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
- 本清单只负责把 `plan/spec -> 当前代码` 的缺口拆成执行项
- 如果本清单和 spec 冲突，应更新本清单，而不是绕过 spec 改代码

## 状态定义

- `已完成`：代码、行为和对应测试都已经达到 plan/spec 要求
- `代码已完成，待人工验收`：代码主链已完成，自动化或代码层验证已通过，但桌面交互仍需人工确认
- `部分完成`：主干代码已在，但行为、边界或测试还不完整
- `未完成`：当前仓库里还没有完整实现

## 当前总结

已完成或基本收口的主线：
- Phase 1 后端路径适配主干
- 模型目录统一到项目根目录 `models/`
- 所有引擎统一模型管理语义主干
- Tauri 基础工程、构建链与本地启动链
- Windows 依赖安装脚本
- 本地启动脚本改为 `tauri build --no-bundle --ci`
- `P2-01` Tauri 插件与配置收口
- `P2-02` TypeScript 类型与默认值映射

仍然明显未收口的方向：
- 热键/录音/文本输出的人机交互验收
- 主窗口体验继续向原版 `app/` 收敛
- GitHub Actions CI/CD
- Windows 自动启动

## Phase 1 差距项

### P1-01 路径管理统一收口
- 当前判断：`已完成`
- 说明：
  - 路径已集中到 [config.py](D:\learn\AIGC\voicescribe\0324\voicescribe\backend\config.py)
  - 模型目录已收口到 [models](D:\learn\AIGC\voicescribe\0324\voicescribe\models)
- 已有验证：
  - 见 [第一阶段测试.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\第一阶段测试.md) 中 `1`、`10`、`13`、`14`

### P1-02 模型注册表 rebasing 与自愈
- 当前判断：`已完成`
- 说明：
  - [server.py](D:\learn\AIGC\voicescribe\0324\voicescribe\backend\server.py) 已支持旧路径 rebasing 与本地模型自愈识别
- 已有验证：
  - 见 [第一阶段测试.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\第一阶段测试.md) 中 `13`、`14`

## Phase 2 差距项

### P2-01 Tauri 工程骨架完整性
- 当前判断：`已完成`
- 当前代码现状：
  - [tauri.conf.json](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\tauri.conf.json) 已补齐 `global-shortcut`、`clipboard-manager`、`store` 插件配置
  - [Cargo.toml](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\Cargo.toml) 已声明对应 Rust 插件依赖
  - [lib.rs](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\src\lib.rs) 已初始化三项官方插件
  - [appStore.ts](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src\stores\appStore.ts) 已从仅 `localStorage` 持久化迁移为 `tauri-plugin-store` 主链，浏览器开发态保留回退
  - [ShellHeader.tsx](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src\components\ShellHeader.tsx) 的复制最近结果已切到 `tauri-plugin-clipboard-manager`
- 已有验证：
  - 见 [第一阶段测试.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\第一阶段测试.md) 中 `23`

### P2-02 TypeScript 类型与默认值映射
- 当前判断：`已完成`
- 当前代码现状：
  - [index.ts](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src\types\index.ts) 已补齐 `OutputMode`、`Transcription`、`TranscriptionSegment`
  - [appStore.ts](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src\stores\appStore.ts) 已对齐默认值，并补齐 `currentTranscription` / `transcriptions`
  - [ShellHeader.tsx](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src\components\ShellHeader.tsx) 与 [recordingFlow.ts](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src\lib\recordingFlow.ts) 已切到新状态语义
- 已有验证：
  - 见 [第一阶段测试.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\第一阶段测试.md) 中 `22`

## Phase 3 差距项

### P3-01 后端子进程与 embedded Python 初始化
- 当前判断：`部分完成`
- 当前代码现状：
  - [backend.rs](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\src\commands\backend.rs) 已支持运行时准备 venv、最小依赖安装与后端启动
  - `build_embedded_python.bat` 与 `resources/python-embed/README.md` 已存在
- 剩余问题：
  - 正式 embedded Python 资源包与安装态闭环仍未完全落地
- 已有验证：
  - 见 [第一阶段测试.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\第一阶段测试.md) 中 `16`、`17`

### P3-02 全局热键完整行为
- 当前判断：`代码已完成，待人工验收`
- 剩余问题：
  - 真实桌面热键交互尚未做完整人工验收
- 建议优先级：高

### P3-03 音频录制链路
- 当前判断：`代码已完成，待人工验收`
- 剩余问题：
  - 真实麦克风和生成 WAV 的端到端验收尚未完成
- 建议优先级：高

### P3-04 文本输出能力
- 当前判断：`代码已完成，待人工验收`
- 剩余问题：
  - 外部应用注入、焦点恢复、降级回剪贴板等真实桌面行为尚未做完整人工验收
- 建议优先级：高

## Phase 4 差距项

### P4-01 主窗口结构与原始 app 对齐
- 当前判断：`部分完成`
- 当前代码现状：
  - [Layout.tsx](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src\components\Layout.tsx) 已从 dashboard 式布局收口到更接近原版设置窗口的单窗体结构
  - [ShellHeader.tsx](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src\components\ShellHeader.tsx) 已按原版菜单栏语义收口为状态 + 最近转录 + 快捷操作
  - [GeneralSettings.tsx](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src\pages\GeneralSettings.tsx)、[EngineSettings.tsx](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src\pages\EngineSettings.tsx)、[VocabularySettings.tsx](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src\pages\VocabularySettings.tsx)、[SpeakerSettings.tsx](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src\pages\SpeakerSettings.tsx)、[HotkeySettings.tsx](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src\pages\HotkeySettings.tsx) 已向原版 `Form + Section` 结构收敛
- 剩余问题：
  - 仍缺一轮人工界面对照验收，确认结构与体验是否达到原版预期
  - 录音悬浮窗与托盘入口仍未完全做到原版感知一致
- 已有验证：
  - 见 [第一阶段测试.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\第一阶段测试.md) 中 `27`
- 建议优先级：中

### P4-02 引擎页统一模型语义
- 当前判断：`已完成`
- 说明：
  - 后端与前端主干均已统一
  - 所有引擎已纳入统一模型管理语义
- 已有验证：
  - 见 [第一阶段测试.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\第一阶段测试.md) 中 `11`、`12`、`15`

### P4-03 托盘能力与图标
- 当前判断：`代码已完成，待人工验收`
- 剩余问题：
  - 托盘图标与托盘交互仍建议补一轮人工验收
- 建议优先级：中

## Phase 5 差距项

### P5-01 embedded Python 资源与安装态闭环
- 当前判断：`部分完成`
- 说明：
  - 最小运行闭环已打通
  - [backend.rs](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\src\commands\backend.rs) 已补上 embedded Python `venv` 能力检测，不再盲目拿 `python-embed` 创建 `backend/venv`
  - [build_embedded_python.bat](D:\learn\AIGC\voicescribe\0324\voicescribe\scripts\build_embedded_python.bat) 已补上 `_pth` 处理与 `venv` 能力提示
  - 正式打包资源与安装态冷启动验证仍未完全收口
- 已有验证：
  - 见 [第一阶段测试.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\第一阶段测试.md) 中 `16`、`17`、`24`

### P5-02 GitHub Actions CI/CD
- 当前判断：`部分完成`
- 当前代码现状：
  - [.github/workflows/build-windows.yml](D:\learn\AIGC\voicescribe\0324\voicescribe\.github\workflows\build-windows.yml) 已新增 Windows 构建 workflow
  - 工作流已覆盖 `actions/checkout`、Node、Python、Rust、`npm run tauri:build` 和 NSIS 安装包上传
- 剩余问题：
  - 仍缺 GitHub 远端实际运行一轮的验证
- 已有验证：
  - 见 [第一阶段测试.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\第一阶段测试.md) 中 `25`
- 建议优先级：中

### P5-03 Windows 自动启动
- 当前判断：`代码已完成，待人工验收`
- 当前代码现状：
  - [lib.rs](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\src\lib.rs) 已接入 `tauri-plugin-autostart`
  - [appStore.ts](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src\stores\appStore.ts) 已补齐 `launchAtLogin` 设置、状态同步与启停方法
  - [GeneralSettings.tsx](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src\pages\GeneralSettings.tsx) 已新增开机自启开关
- 剩余问题：
  - 仍缺真实 Windows 登录项是否写入成功的系统侧验收
- 已有验证：
  - 见 [第一阶段测试.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\第一阶段测试.md) 中 `26`
- 建议优先级：中

## 建议执行顺序

1. 先做人工验收项
- `P3-02`
- `P3-03`
- `P3-04`
- `P4-03`

原因：这些项代码主链已经在，下一步最需要的是确认真实 Windows 桌面行为。

2. 再补工程收口项
- `P2-01`
- `P4-01`

原因：这些属于一致性与体验收敛，会影响后续继续扩展时的稳定性。

3. 最后补交付链路
- `P5-01`
- `P5-02`
- `P5-03`

原因：这些是安装态、CI 和系统集成层，适合在主流程稳定后继续推进。

## 与测试文档的关系

每完成一个差距项，都必须同步更新：
- [第一阶段测试.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\第一阶段测试.md)

如果修复过程中出现新的偏差、重复修复或需求口径误解，还必须同步更新：
- [2026-03-25-session-bug-log.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\2026-03-25-session-bug-log.md)

## 当前结论

正式 spec 还没有全部完成。
当前更准确的状态是：
- Phase 1 主干已完成
- Phase 2 中 `P2-02` 已完成，`P2-01` 仍部分完成
- Phase 3 代码主链大多已在，但仍缺人工验收
- Phase 4 主干已在，体验与托盘仍有人工收尾项
- Phase 5 仍有安装态、CI 和自动启动未完成

因此，接下来不应再泛化地说“spec 已完成”，而应以上述状态为准。









