# VoiceScribe Windows 迁移正式 Spec

更新时间：2026-03-29

基线文档：
- [0325第一阶段改造计划.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\0325第一阶段改造计划.md)
- [0325项目初始.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\archive\0325项目初始.md)
- 现有 macOS 实现目录 [app](D:\learn\AIGC\voicescribe\0324\voicescribe\app)
- 界面专项计划 [2026-03-27-ui-imitation-plan.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\2026-03-27-ui-imitation-plan.md)
- 专题需求文档 [2026-03-28-rt-history-hotkey-requirements.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-rt-history-hotkey\2026-03-28-rt-history-hotkey-requirements.md)
- 专题 Spec [2026-03-28-rt-history-hotkey-spec.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-rt-history-hotkey\2026-03-28-rt-history-hotkey-spec.md)
- 专题测试报告 [2026-03-29-rt-history-hotkey-test-report.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-rt-history-hotkey\2026-03-29-rt-history-hotkey-test-report.md)

本文档是当前唯一正式 spec。如与当前代码、临时说明或旧版 spec 冲突，一律以 [0325第一阶段改造计划.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\0325第一阶段改造计划.md) 与本文档为准。

## 1. Source of Truth

优先级从高到低如下：
1. [0325第一阶段改造计划.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\0325第一阶段改造计划.md)
2. 本正式 spec
3. 原始 macOS 行为基线 [app](D:\learn\AIGC\voicescribe\0324\voicescribe\app)
4. 当前实现代码
5. 旧版 spec 与历史说明文档

## 2. 全局硬约束

### 2.1 模型目录与状态

1. 所有模型必须下载到项目根目录 [models](D:\learn\AIGC\voicescribe\0324\voicescribe\models)。
2. 所有模型状态只从项目根目录 `models/` 读取。
3. 模型注册表固定为 `models/voicescribe_models.json`。
4. 历史旧绝对路径必须 rebasing 到当前项目 `models/`。
5. 不允许存在第二套模型根目录语义。

### 2.2 统一模型管理语义

1. `/engines` 返回完整模型清单。
2. `/models` 返回模型状态。
3. 前端必须采用“完整模型清单 + 状态叠加”显示。
4. 未下载模型必须显示且保留下载入口。
5. 已下载模型必须保留删除入口。
6. 所有引擎必须遵循同一模型管理语义，不能只对 FunASR 特判。

### 2.3 行为对齐

以下行为必须以 macOS 版为基线对齐：
1. 长按快捷键开始录音，释放结束录音。
2. 双击快捷键切换录音开始/停止。
3. 录音中按 `ESC` 取消。
4. 输出模式支持 `clipboard`、`directInput`、`both`。
5. 主窗口关闭时进入托盘，而不是直接退出。

## 3. Phase 1: 后端跨平台适配

必须完成：
1. 路径集中管理到 `backend/config.py`。
2. `server.py`、`whispercpp_engine.py`、`speaker.py`、`ai_refiner.py` 全部去除 macOS 硬编码路径。
3. `/models`、`/models/download`、`/models/delete` 统一遵循项目根 `models/` 目录。
4. 本地已有模型但注册表缺失时，必须能自愈识别并重建注册表。
5. 旧路径命中 `models/` 子路径时，必须自动 rebasing。

## 4. Phase 2: Tauri 工程骨架

必须完成：
1. `tauri-app/` 作为新前端根目录。
2. Rust commands 至少拆分为 `backend.rs`、`audio.rs`、`hotkey.rs`、`text_input.rs`。
3. `tauri.conf.json` 明确声明前端构建目录、资源目录和窗口配置。
4. TypeScript 类型、默认值和存储结构与原 Swift `AppState` 对齐。
5. `store`、`clipboard-manager`、`global-shortcut` 等基础插件接入并可构建。

## 5. Phase 3: 核心功能迁移

### 5.1 后端子进程与 embedded Python

1. 桌面端负责启动/停止后端子进程。
2. 首次运行需准备 Python 运行时与最小依赖。
3. 安装态必须支持 embedded Python 或等价方案。
4. 该能力属于最终封装/安装验收项；在 Phase 1-4 功能调试阶段，允许先使用系统 Python 回退链路完成开发态与安装态模拟联调，但不得据此宣称安装包闭环已最终验收。

### 5.2 全局热键

1. 完整支持长按、双击、取消。
2. 350ms 双击阈值保持一致。
3. 快捷键事件需完整桥接到前端录音流。

## 2026-03-30 快捷键模型重构补充

本补充用于收口当前“快捷键录制与运行时命中不是同一套模型”的问题。后续实现必须按本节执行，不再继续兼容 `primaryCode + primaryKeyCode + modifiers` 旧结构。

### A. 单一真相

1. 快捷键的唯一真相在 Rust 运行时，由 [hotkey.rs](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\src\commands\hotkey.rs) 持有。
2. 前端只保存和展示 Rust 产出的快捷键结果，不再自行定义匹配规则，不再自行拼装“主键 / 修饰键”语义。
3. 快捷键模型统一为“1 个或 2 个 Windows 原生键位”，不再区分“主键”和“修饰键”字段。
4. 左右 `Alt` 必须按 Windows 原生键位区分，不能退化为单一 `Alt`。

### B. 新数据结构

TypeScript 与 Rust 的结构统一为：

```ts
type HotkeyBinding = {
  keys: number[];   // 长度只能是 1 或 2；元素为 Windows Virtual-Key；升序且唯一
  display: string;  // 由 Rust 统一生成，前端直接展示
};
```

约束如下：

1. `keys.length` 只能是 `1` 或 `2`。
2. `keys` 必须去重并排序后再落盘。
3. 左右键使用 Windows 原生 VK 区分，至少包括：
   - `VK_LMENU (0xA4)`
   - `VK_RMENU (0xA5)`
4. 若未来需要扩展左右 `Ctrl`、左右 `Shift`、左右 `Win`，也只能按同一 `keys[]` 结构扩展，不能重新引入“主键 / 修饰键”拆分。

### C. Input / Output Contract

Runtime commands stay in Rust, but settings-page capture now uses browser events and still produces the same `HotkeyBinding` structure.

1. Settings-page capture input
   - Input: current-window `keydown/keyup` `KeyboardEvent.code`
   - Output: frontend draft `HotkeyBinding { keys: number[], display: string }`
   - Constraint: only 1-key or 2-key bindings are allowed; capture state exists only in the page

2. `register_hotkey_binding(binding: HotkeyBinding) -> Result<(), String>`
   - Input: `{ keys: number[], display: string }`
   - Effect: writes the binding into Rust runtime state and ensures the hook thread exists
   - Constraint: accepts only 1-key or 2-key bindings

3. `debug_hotkey_log(message: String) -> Result<(), String>`
   - Input: frontend trace text
   - Effect: writes browser-capture/apply/re-register diagnostics into the shared hotkey log

4. `get_hotkey_display() -> Result<String, String>`
   - Input: none
   - Output: current registered display text; returns `???` when unset

### D. Capture Logic

Settings-page capture now uses current-window browser `keydown/keyup`; runtime global hotkey listening still uses Rust `WH_KEYBOARD_LL`.

Constraints:

1. Clicking Start Capture only flips frontend `capturing=true` and binds current-window listeners; it no longer invokes Rust `start_hotkey_capture()`
2. Capture must map `KeyboardEvent.code` to Windows VK; do not capture by `event.key`
3. Left/right Alt must remain explicit: `AltLeft -> 0xA4`, `AltRight -> 0xA5`
4. Capture accepts only 1 or 2 keys
   - single key: press then release the same key to complete
   - two keys: once the 2-key set exists, complete on `keyup`
5. More than 2 keys is overflow: do not create a binding; show the frontend overflow message and exit that capture attempt
6. `Esc` only cancels the current draft capture; it does not mutate the saved binding
7. Phase 1 does not fold AltGr; if the browser reports `Ctrl + RightAlt`, persist the actual 2-key combo
8. Clicking Apply only writes the draft into store; actual re-registration still flows through `useHotkey.ts -> register_hotkey_binding(...)`


匹配状态机固定为：

1. 运行时维护一个“当前按下集合” `pressed_keys`。
2. 每次键盘事件都把原始事件归一化到 Windows VK，再更新 `pressed_keys`。
3. 当 `pressed_keys` 与已注册 `binding.keys` 完全相等时，视为“当前热键处于按下态”。
4. 当状态从“不相等”变为“相等”时，触发热键按下分支。
5. 当状态从“相等”变为“不相等”时，触发热键释放分支。
6. 长按、单击切换、`Esc` 取消的上层录音行为继续复用现有状态机，但输入条件改为新的集合相等判定。

运行时状态约束补充如下：

1. `register_hotkey_binding(...)` only updates saved binding and runtime matching state.
2. Hook events are normalized to Windows VK before runtime matching; settings-page capture no longer branches inside the hook.
3. Browser capture and runtime matching must still agree on the same left/right Alt normalization targets.
4. Right Alt must normalize to `VK_RMENU (0xA5)` consistently; do not collapse it into a generic Alt key.

### F. 前端注册路径

必须删除双注册入口，只保留一条正式注册路径：

1. 设置页录制完成后，只允许更新 store 中的 `settings.hotkeyBinding`。
2. 真正调用 `registerHotkeyBinding(...)` 的入口只保留在 [useHotkey.ts](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src\hooks\useHotkey.ts)。
3. [HotkeySettings.tsx](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src\pages\HotkeySettings.tsx) 不再直接调用 `registerHotkeyBinding(...)`。
4. 前端界面必须保持中文；录制提示、保存成功、失败提示、未设置文案都必须为中文。

### G. 需要一起修改的文件

本次重构至少需要同步修改以下文件：

1. [docs/active/2026-03-25-voicescribe-windows-spec.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\2026-03-25-voicescribe-windows-spec.md)
2. [tauri-app/src/types/index.ts](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src\types\index.ts)
3. [tauri-app/src/stores/appStore.ts](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src\stores\appStore.ts)
4. [tauri-app/src/pages/HotkeySettings.tsx](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src\pages\HotkeySettings.tsx)
5. [tauri-app/src/hooks/useHotkey.ts](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src\hooks\useHotkey.ts)
6. [tauri-app/src/api/tauri.ts](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src\api\tauri.ts)
7. [tauri-app/src-tauri/src/state.rs](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\src\state.rs)
8. [tauri-app/src-tauri/src/commands/hotkey.rs](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\src\commands\hotkey.rs)
9. [tauri-app/src-tauri/src/lib.rs](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\src\lib.rs)

### H. 需要删除的旧逻辑

以下旧逻辑必须一起删除，不能半删半留：

1. `HotkeyBinding.primaryCode`
2. `HotkeyBinding.primaryKeyCode`
3. `HotkeyBinding.modifiers`
4. Rust 侧 `build_binding_from_capture(...)` 的“主键 + 修饰键”组装语义
5. Rust 侧 `modifiers_match(...)`
6. Rust 侧 `primary_key_matches(...)`
7. 前端基于旧结构的主键/修饰键展示逻辑
8. [HotkeySettings.tsx](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src\pages\HotkeySettings.tsx) 里的直接注册入口
9. 任意浏览器 `KeyboardEvent` 录制残留或旧兼容适配逻辑
10. 录制态与运行态共用同一份 `active / pressed_keys` 状态的混合实现

### I. 旧设置迁移规则

旧设置兼容只做一次迁移，不继续保留旧接口长期共存：

1. 若本地已保存旧结构 `primaryCode / primaryKeyCode / modifiers`，启动时只做一次转换为 `keys[]`。
2. 转换失败时，直接回退到默认快捷键，不保留半兼容状态。
3. 一旦迁移完成，持久化层只允许写入新结构。

### J. 验收标准

以下全部满足，才可宣称热键重构完成：

1. 设置页中文界面恢复完整，且文案不是临时英文占位。
2. 可录制单键。
3. 可录制双键。
4. 左 `Alt` 与右 `Alt` 可分别录制，并在运行时命中时表现不同。
5. 保存后重启应用，快捷键仍可恢复。
6. 长按开始 / 松开停止行为正常。
7. 单击开始 / 再按一次停止行为正常。
8. 录音中按 `Esc` 可取消。
9. `cargo check`、`npm run build`、`cmd /c scripts/start_windows_system.bat` 通过。
10. 上述测试结果先写入 [第一阶段测试.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\第一阶段测试.md)，再对外汇报。

### K. 风险说明

本节的目标是降低“半迁移、双逻辑并存”带来的新 bug 风险，但不能把“写了 spec”本身当作“保证一次实现绝对无 bug”。真正的风险控制手段是：

1. 单一模型
2. 删除旧逻辑而不是并存
3. 实现后按验收标准逐条验证并写入测试文档

## 2026-03-30 快捷键录制最小探针模式补充

当出现“开始录制后无响应，且多轮修改仍未确认根因”的情况时，必须先进入最小探针模式，而不是继续直接修改录制完成、保存或重新注册逻辑。

When capture appears unresponsive, enter minimal probe mode before changing apply/save/re-register logic again.

### A. Goal

1. Confirm whether browser `keydown/keyup` events enter the settings-page capture listener.
2. Confirm whether normalized VK output and draft binding assembly match the user input sequence.
3. Do not blame persistence, apply, or runtime re-register paths before the first two points are proven.

### B. Probe Constraints

1. Only add minimal observation logs in [HotkeySettings.tsx](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src\pages\HotkeySettings.tsx), [useHotkey.ts](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src\hooks\useHotkey.ts), and [hotkey.rs](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\src\commands\hotkey.rs).
2. Probe mode does not add a second listener source and does not change the hotkey model again.
3. Probe logs should prioritize: browser `code/location`, normalized VK, current capture set, apply, and re-register results.
4. If no browser key events arrive during capture, investigate the current-window input path first.
5. If browser capture works but runtime behavior diverges, investigate normalization parity and runtime matching only then.

### C. Minimal Manual Regression

探针模式下只做最小回归，不测保存和应用：

1. 打开快捷键页。
2. 点击“开始录制”。
3. 按一次 `A`。
4. 按一次右 `Alt`。
5. 点击“停止录制”。
6. 仅根据热键日志判断事件是否进入 hook 与 capture 分支。

## 2026-03-30 hook 生命周期自检补充

当最小探针模式证明“录制窗口内没有任何键盘事件进入当前 hook 回调链路”时，下一步必须先检测 hook 生命周期本身，而不是继续修改 capture 完成逻辑。

### A. 检测目标

1. 证明 `ensure_hook_thread()` 判断“already running”时，底层 hook 线程是否真的仍然存活。
2. 检测 `HOOK_THREAD`、`HOOK_THREAD_ID`、线程句柄完成态是否存在不一致。
3. 记录 hook 线程退出时机与退出原因。

### B. 最小自检接口

Rust 热键模块允许增加最小自检接口，仅用于本地诊断：

1. 返回 `hook_thread_slot_present`
2. 返回 `hook_thread_id_present`
3. 返回 `hook_thread_finished`
4. 返回 `capture_active`
5. 返回 `capture_generation`

该接口只用于诊断，不改变录制与运行时业务逻辑。

### C. 生命周期要求

1. hook 线程退出时必须写日志。
2. `ensure_hook_thread()` 不允许只根据 `HOOK_THREAD.is_some()` 判断线程仍然有效。
3. 若检测到“句柄仍在，但线程已退出”或“thread id 丢失但 slot 仍在”的陈旧状态，后续实现必须先清理陈旧状态，再决定是否重建。

## 2026-03-30 Capture-To-Apply Diagnostics Supplement

This supplement covers one shared log timeline for `start capture -> browser key events -> stop/apply -> re-register`. Runtime matching semantics do not change.

### A. Source Of Truth

1. Temporary settings-page capture state lives in frontend `capturing / draftBinding / captureKeys`.
2. Saved binding and runtime match state still live in Rust `HotkeyRuntime`.
3. Cross-layer diagnosis uses the existing `voicescribe-hotkey.log`; no extra persisted fields or second log file are introduced.

### B. Logging Contract

1. Start-capture logs must include button click, current `capturing / draftBinding / settings.hotkeyBinding`, and browser-listener binding.
2. Capture-event logs must include browser `keydown/keyup`, normalized Windows VK, and current capture set / overflow / cancel / complete state.
3. Stop/apply logs must include stop-or-cancel action, apply click, and store-driven `registerHotkeyBinding(...)` start/success/failure.
4. All new logs continue to write into `C:\Users\DingK\AppData\Local\Temp\voicescribe-hotkey.log`.

### C. Files That Must Change Together

1. `docs/active/2026-03-25-voicescribe-windows-spec.md`
2. `docs/active/2026-03-26-implementation-gap-checklist.md`
3. `tauri-app/src/pages/HotkeySettings.tsx`
4. `tauri-app/src/api/tauri.ts`
5. `tauri-app/src/hooks/useHotkey.ts`
6. `tauri-app/src-tauri/src/commands/hotkey.rs`
7. `tauri-app/src-tauri/src/lib.rs`

### D. Old Logic Removal

1. Remove settings-page dependencies on `start_hotkey_capture()` / `stop_hotkey_capture()` / `hotkey-capture-complete`.
2. Remove Rust-side settings-only `CaptureState` and related capture commands.
3. Do not introduce a second Windows hook, a second log file, or a second persistence structure.

### E. Acceptance

1. After clicking Start Capture, logs show the frontend button action and browser listener binding.
2. During capture, pressing `A`, left `Alt`, right `Alt`, or a 2-key combo produces browser `keydown/keyup` plus normalized VK logs.
3. After clicking Apply, logs show frontend apply, store-driven re-register, and Rust `register_hotkey_binding`.
4. Runtime hotkey matching is still validated by Rust hook logs; settings-page capture no longer needs a Rust capture branch.

### F. Failure Branches

1. No browser `keydown/keyup` arrives during capture.
2. More than 2 keys triggers overflow.
3. User stops capture without a draft binding.
4. Apply succeeds in UI state but re-register fails.
5. Browser-captured binding and Rust runtime match behavior diverge.

### 5.3 RT / History / Hotkey Bundle
### 5.3 ????
1. 当前主窗口侧边栏允许扩展为 7 个页面：通用、引擎、实时转录、历史记录、热词、说话人、快捷键。
2. 通用页允许增加 `启用流式传输`、`AI 摘要总结`、`保留音频` 三个全局开关。
3. `启用流式传输` 开启后，历史记录需要自动记录流式和非流式结果。
4. `AI 摘要总结` 只有在 `启用流式传输` 开启时才可开启，并且只作用于流式结果。
5. 快捷键页必须从手工输入 keycode 迁移到真实按键录制能力，支持单键、组合键，并区分左右 `Alt`。
6. 本专题的自动化测试结果必须额外写入专题测试报告，再回写主测试文档与主 checklist。

## 6. Phase 4: UI 实现

### 6.1 主窗口布局

Windows 版设置窗口必须采用“侧边栏 + 原生设置页”结构，并遵守以下硬约束：
1. 必须采用左侧导航 + 右侧内容区，不允许顶部 tab 条替代。
2. 必须采用单层主表面，不允许再出现 `outer shell + inner panel` 双层结构。
3. 如果视觉上存在统一背景表面，页面内容必须直接落在该主表面上，不允许再额外套一层内容壳。
4. 左侧侧边栏宽度基本稳定，右侧内容区随窗口放大自然扩展。
5. 不允许继续使用“中间固定内容壳居中，放大后四周露出底板”的网页式布局。
6. 窗口高度不能死锁为单一固定值，应采用有上下限约束的自适应窗口策略。
7. 默认窗口下优先保证各页主要信息尽量单屏可见；允许滚动，但应优先局部滚动而非整页滚动。
8. 视觉优先级固定为：信息可见性 > 单屏可读性 > 装饰性卡片感。

### 6.2 通用页面

通用页面必须尽量复刻原生 `app` 的 `Form + Section` 组织方式：
1. 单列优先，不使用双列 dashboard 信息板。
2. 分组顺序固定为：语言、输出方式、其他、关于。
3. 每个设置项优先采用“左侧标题/说明，右侧控件”的行式布局。
4. 关于分组中的版本和后端状态必须轻量呈现，不做独立大卡片。
5. 默认窗口下，通用页主要信息应尽量无需整页上下滚动即可读完。

### 6.3 其他页面

1. 引擎页：顶部保留引擎与模型选择，长列表采用局部滚动。
2. 实时转录页：按说话人时间线展示流式结果，每条只显示说话人名、文本、时间戳；AI 摘要显示在页面中。
3. 历史记录页：按整次任务展示历史记录，支持复制文本、下载文本、下载音频、删除单条、清空全部。
2. 词汇页：输入区与热词列表紧凑排列，列表局部滚动。
3. 说话人页：已注册列表与录制/注册区分层，列表局部滚动。
4. 快捷键页：当前快捷键、修饰键、主键与使用说明尽量单屏呈现。

### 6.4 视觉风格

1. 保留圆角米色原生感。
2. 降低阴影、渐变和网页背景氛围。
3. 分组之间以轻边框、轻背景或分隔线区分，不做厚卡片堆叠。
4. 按钮、输入框、开关、文字层级必须统一。

## 7. Phase 5: 构建与打包

本章属于最后阶段任务，默认在 Phase 1-4 的功能调试、联调和人工验收收口后再推进；未进入该阶段前，封装与打包相关未完成项不视为当前前序功能调试阻塞项。

1. 安装包包含 Tauri 可执行文件、后端代码和运行时初始化逻辑。
2. 安装包不包含预置模型。
3. 首次启动必须能完成运行时初始化。
4. Windows 自动启动使用系统级实现，不沿用 macOS 语义。
5. GitHub Actions 必须提供 Windows 构建工作流。

## 8. 测试与验收

### 8.1 自动化与代码层验证

至少覆盖：
- `python -m compileall backend`
- `npm run build`
- `cargo check`
- `npm run tauri:build`
- `/health`

## 2026-03-29 模型与运行时缓存目录补充

1. 运行期所有与模型相关的下载、加载、索引、词典和推理缓存，统一落在仓库根 `models/` 下。
2. 不允许继续把 `modelscope`、`huggingface`、`transformers`、`torch`、`jieba` 等缓存写到 `C:\Users\<user>\.cache`、`%LOCALAPPDATA%\Temp` 或其他用户目录默认路径。
3. 若历史运行已在 C 盘默认缓存目录生成模型文件，启动时应优先迁移到仓库 `models/` 下的对应目录，再清理 C 盘残留缓存。
4. `/health`、日志与人工测试记录需要能证明当前运行链路已从仓库 `models/` 读取，不再依赖 C 盘默认缓存。
- `/engines`
- `/models`
- 真实下载/删除主链路

### 8.2 人工验收

至少覆盖：
- 全局热键真实行为
- 麦克风录音与转录
- 实时转录页的说话人时间线展示
- 历史记录页的复制、下载、删除、清空行为
- 流式结果与非流式结果进入历史记录的自动记录行为
- AI 摘要在实时转录页和历史记录详情中的显示
- 外部应用文本输出
- 托盘与托盘图标
- Windows 开机自启
- 安装态 embedded Python 冷启动
  说明：该项属于 Phase 5 最终封装阶段人工验收，不作为当前前序功能调试完成与否的判断条件。
- 主窗口与各设置页的界面一致性
- 窗口从初始尺寸到放大尺寸的比例稳定性

### 8.3 测试文档规则

没有写进 [第一阶段测试.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\第一阶段测试.md) 的，一律视为没测。

## 9. 历史文档索引

- 旧版 spec： [2026-03-25-voicescribe-windows-spec-v1-archived.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\archive\2026-03-25-voicescribe-windows-spec-v1-archived.md)
- Session Bug Log： [2026-03-25-session-bug-log.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\2026-03-25-session-bug-log.md)
- Phase 1 对照： [2026-03-25-phase1-plan-comparison.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\archive\2026-03-25-phase1-plan-comparison.md)
- Plan/Spec 一致性核对： [2026-03-26-plan-spec-consistency-check.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\archive\2026-03-26-plan-spec-consistency-check.md)
- 实时转录专题需求： [2026-03-28-rt-history-hotkey-requirements.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-rt-history-hotkey\2026-03-28-rt-history-hotkey-requirements.md)
- 实时转录专题 Spec： [2026-03-28-rt-history-hotkey-spec.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-rt-history-hotkey\2026-03-28-rt-history-hotkey-spec.md)
- 实时转录专题测试报告： [2026-03-29-rt-history-hotkey-test-report.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-rt-history-hotkey\2026-03-29-rt-history-hotkey-test-report.md)
- 录音悬浮窗专题需求： [2026-03-29-overlay-recording-requirements.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-overlay-recording\2026-03-29-overlay-recording-requirements.md)
- 录音悬浮窗专题 Spec： [2026-03-29-overlay-recording-spec.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-overlay-recording\2026-03-29-overlay-recording-spec.md)
- 录音悬浮窗专题测试报告： [2026-03-29-overlay-recording-test-report.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-overlay-recording\2026-03-29-overlay-recording-test-report.md)

## 2026-03-29 录音悬浮窗专题补充

- 录音悬浮窗本轮不再按“单独 UI 卡片”处理，而是作为录音流状态机、事件桥接、实时音量反馈与浮层视觉的一体化专题收口。
- 悬浮窗中的波纹必须来自真实录音电平事件，不能继续使用与录音无关的模拟动画。
- 悬浮窗显示/隐藏、快捷键停止、点击取消/停止，都必须回到主录音流统一处理，不能由悬浮窗自身隐式维护状态。

## 2026-03-29 录音兼容与说话人模型加载补充
1. Windows 录音链路不得强制要求输入设备原生支持 16kHz + mono；允许按设备原生输入配置采集，再在本地统一转换为 16kHz / 16-bit / mono WAV 供后续转录链路使用。
2. 说话人相关能力必须拆分为三条显式加载链路：转录模型加载、说话人分离模型加载、说话人识别（声纹）模型加载，不能再依赖隐式副作用。
3. 当启用说话人分离时，必须能明确记录当前到底走了 FunASR 内置 speaker 标签，还是走外部 SpeakerDiarizer 的 diarization / speaker verification 链路。
4. 说话人注册、说话人识别、带说话人标签的转录，必须都能证明各自依赖的模型已实际加载并被使用，而不是仅在健康检查里显示依赖包可用。
## 2026-03-29 FunASR / Torch 运行时探测补充

- Windows 下不能只用 importlib.find_spec() 判断 FunASR / 说话人模型可用性；必须补充真实运行时探测，至少覆盖 	orch 导入、
unasr.AutoModel 导入，以及对应异常日志。
- /health 与模型状态展示必须区分“包存在”和“运行时可加载”。出现 	orch DLL 初始化失败时，不能继续把 FunASR / speaker feature 标记为可用。
- 说话人识别、说话人分离、转录三条链路都要给出明确日志：模型名、加载入口、运行时探测结果、失败异常。
- 当前已定位的 Windows 真实风险是 	orch 导入阶段抛出 WinError 1114，需要在模型链路验收前先收口该运行时问题。

## 2026-03-29 外部分离模型路径补充

- SpeakerDiarizer 的外部分离模型不能继续用 
unasr.AutoModel 直接加载 speaker-diarization 仓库 ID；当前可验证可用的路径是 modelscope 的 SegmentationClusteringPipeline。
- iic/speech_campplus_speaker-diarization_common 在本机已验证可初始化 pipeline，但 Windows 下必须先提供 16kHz / mono wav，否则会触发 	orchaudio sox extension is not supported on Windows。
- 因此外部分离链路在实现上需要：补齐 modelscope 运行时依赖、Windows 侧输入预重采样到 16k、把 pipeline 输出统一转换为 [{start,end,speaker}] 结构。
- 主转录链路仍优先使用 FunASR 内置 speaker 标签；外部分离链路作为补充能力和回退路径，需要能独立加载并可单独验证。

## 2026-03-29 Whisper Windows 运行时回退补充

- Windows 下不能把 `Whisper available=true` 直接视为“Whisper 稳定可用”；本轮已发现 `faster-whisper / ctranslate2` 在 `WhisperModel(...)` 初始化阶段可触发 native 崩溃。
- 因此 Windows 端允许对 Whisper 引擎增加实现级回退：优先尝试 `faster-whisper`，若运行时探测或真实加载失败，则切换到 `openai-whisper`，优先保证存在一条稳定的 Whisper 转录链路。
- 测试与汇报时必须区分 “FunASR 稳定链路” 与 “Whisper 稳定链路”；未写入 [第一阶段测试.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\第一阶段测试.md) 的，仍视为未验证。

## 2026-03-29 FunASR GPU 运行时补充

- FunASR 的设备选择策略保持为 `CUDA > MPS > CPU`，但这只是代码层优先级；最终是否能进入 GPU 取决于后端虚拟环境安装的 `torch / torchaudio` 是否为 CUDA 构建。
- 如果本机 `nvidia-smi` 正常、但 `torch.cuda.is_available()` 为 `False`，应优先判定为运行时构建错误，而不是业务代码错误。
- FunASR GPU 验收必须至少同时满足三点：`torch.cuda.is_available() == True`、加载日志显示 `[FunASR] Using device: cuda:0`、真实转录请求可在该设备链路下完成。
