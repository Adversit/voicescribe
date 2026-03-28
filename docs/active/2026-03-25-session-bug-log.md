# 2026-03-25 Session Bug Log

更新时间：2026-03-28

本文档记录本次会话中，由用户指出、而非首次实现即正确完成的问题。

## 1. Cargo 在终端中不可用
- 表现：`cargo --version` 在 PowerShell 中报 `CommandNotFoundException`。
- 原因：Rust 已安装，但当前 PowerShell 会话的 `PATH` 没有包含 Rust 安装目录。
- 处理：通过临时补 PATH、安装 MSVC Build Tools、补 PowerShell profile 解决。

## 2. 重启后界面没有更新
- 表现：代码已修改，但桌面应用界面没有变化。
- 原因：旧进程没有完全清理，看到的不是最新构建产物。
- 处理：补强重启流程，先清理旧桌面端、旧 Python 后端和端口占用，再启动新版本。

## 3. 应用没有最小化到托盘
- 表现：关闭主窗口时没有进入托盘。
- 原因：最初只完成了窗口启动，没有补完整的关闭转托盘逻辑。
- 处理：补全托盘菜单、关闭隐藏、托盘恢复主窗口逻辑。

## 4. 托盘没有图标
- 表现：托盘有行为但没有显示图标。
- 原因：托盘逻辑先完成，但图标资源没有正确绑定。
- 处理：补充托盘图标资源绑定与配置。

## 5. FunASR 模型列表前后端口径不一致
- 表现：引擎页中 FunASR 的“可选模型”和“可下载模型”数量不一致。
- 原因：`/engines` 与 `/models` 的模型清单没有统一来源。
- 处理：统一 FunASR 模型列表，并让前后端基于同一模型清单渲染。

## 6. 本地 `models/` 目录没有被正确识别
- 表现：项目根目录已有模型，但系统未显示为已下载。
- 原因：桌面端曾读取其他运行时目录，且注册表中保留旧绝对路径。
- 处理：统一收口到项目根目录 `models/`，并增加旧路径 rebasing。

## 7. 模型目录口径不统一
- 表现：系统并非严格只认项目根目录 `models/`。
- 原因：后端配置、桌面端启动参数和注册表路径没有完全收口。
- 处理：明确口径为“下载到 `models/`、读取也只从 `models/`、旧路径 rebasing 到当前 `models/`”。

## 8. 原有“未下载模型展示 + 下载入口”功能丢失
- 表现：引擎页只显示已下载模型，没有显示未下载模型，也没有下载入口。
- 原因：第一次修模型页时只对齐了已下载状态，没有保留完整模型清单补全逻辑。
- 处理：前端改为先取完整模型清单，再叠加状态，未下载模型默认显示为“未下载”。

## 9. 只有 FunASR 做了完整模型状态补全
- 表现：FunASR 能显示未下载状态，但其他引擎没有同样行为。
- 原因：前端当时只给 `funasr` 做了特判。
- 处理：去掉前端对 FunASR 的特判，改为所有引擎统一按完整模型清单补全状态。

## 10. 其他引擎没有下载和删除逻辑
- 表现：Whisper、WhisperCpp、Parakeet 没有与 FunASR 一样的下载和删除能力。
- 原因：后端 `/models/download` 和 `/models/delete` 起初只支持 FunASR。
- 处理：扩展后端模型状态与下载删除逻辑，覆盖所有引擎。

## 11. 模型删除后 `/models` 仍残留上次 `downloaded_bytes`
- 表现：模型文件已删除，`available=false`，但 `/models` 仍保留旧的 `downloaded_bytes`。
- 原因：删除模型时只清理了注册表和文件，没有同步清空内存中的下载状态。
- 处理：在 `backend/server.py` 删除逻辑中补了下载状态重置。

## 12. 本地启动脚本误用 `tauri build` 导致 NSIS 锁住可执行文件
- 表现：本地启动时在 NSIS bundling 阶段报 `os error 32`。
- 原因：本地“重建并启动应用”场景误用了 `npm run tauri:build`。
- 处理：把 `scripts/start_windows_system.bat` 改成本地启动脚本，不再走 NSIS 打包。

## 13. 本地启动脚本改成 `cargo build --release` 后退回 `localhost` 页面
- 表现：桌面应用启动后显示 `ERR_CONNECTION_REFUSED` 的 localhost 页面。
- 原因：纯 `cargo build --release` 没有走完整的 Tauri release 构建语义。
- 处理：改为 `npx tauri build --no-bundle --ci`。

## 14. `tauri-plugin-store` JS API 首次接入时误用了构造函数
- 表现：`npm run build` 失败，TypeScript 报 `Store` 构造器私有。
- 原因：误写成 `new Store(...)`。
- 处理：改为 `Store.load(...)`。

## 15. `lib.rs` 被错误编码写回，导致 `cargo check` 失败
- 表现：Rust 报 `stream did not contain valid UTF-8`。
- 原因：用错误编码重写了 `lib.rs`。
- 处理：按 UTF-8 重新写回 `lib.rs`。

## 16. JSON 配置文件被写成带 BOM 的 UTF-8
- 表现：`package.json` 与 `tauri.conf.json` 同时解析失败。
- 原因：重写 JSON 文件时写成了带 BOM 的 UTF-8。
- 处理：改为无 BOM UTF-8。

## 17. 托盘事件桥接后 `cargo check` 因缺少 `Emitter` trait import 失败
- 表现：Rust 报 `no method named emit found for reference &AppHandle`。
- 原因：新增 `app.emit(...)` 时未导入 `tauri::Emitter`。
- 处理：补齐 import。

## 18. 录音悬浮窗窗口化接线时误判了 Tauri builder API 返回类型
- 表现：`cargo check` 首次失败。
- 原因：`icon(...)` 返回 `Result`，以及 `setup` 中 `App` / `AppHandle` 使用不匹配。
- 处理：补 `?` 传播并统一传递 `app.handle()`。

## 19. Tauri unit 型插件被错误写成 `{}` 配置，导致 release 启动 panic
- 表现：release 程序启动即异常退出。
- 原因：`tauri.conf.json` 中把无配置插件写成了对象。
- 处理：清理不需要的插件配置对象。

## 20. 界面源码中文看似正常，但前端 bundle 实际已经乱码
- 表现：界面中文显示为乱码。
- 原因：此前通过 PowerShell 重写文件时没有强制无 BOM UTF-8，导致构建产物带入错误编码文本。
- 处理：统一按 UTF-8 无 BOM 重写前端界面文件并重新构建。

## 21. 主窗口被实现成“底板 + 中间壳”的网页式双层结构
- 表现：窗口放大后能看到明显的底层背景板，通用页也偏 dashboard 风格。
- 原因：`Layout.tsx` 和全局样式用了错误的 shell/panel 布局模型。
- 处理：把布局模型改成“单层主表面 + 侧边栏固定 + 内容扩展”，并把通用页收回单列 `Form + Section` 风格。

## 22. Windows PowerShell 的默认读取方式误导了编码判断
- 表现：`Get-Content` 看到的是 `閫氱敤` 一类乱码，导致误以为源码仍然损坏。
- 原因：Windows PowerShell 对 UTF-8 文件的显示和此前的混合编码文件一起造成了误判；同时真正损坏的文档文件与已经修复好的源码文件混在一起。
- 处理：改用 Python 按 `utf-8` 直接校验文件内容，确认源码与新文档已恢复正常；对仍损坏的文档文件执行整文件重写。

## 备注
- 本文档记录的是“本次会话中由用户指出的问题”，不是完整缺陷清单。
- 后续如果再出现“没有一次做对”的问题，应继续把原因和修复结果追加到本文件。