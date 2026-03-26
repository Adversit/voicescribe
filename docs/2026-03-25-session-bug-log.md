# 2026-03-25 Session Bug Log

更新时间：2026-03-25

本文档记录本次会话中，由用户指出、而非首次实现即正确完成的问题。

## 1. Cargo 在终端中不可用

- 表现：`cargo --version` 在 PowerShell 中报 `CommandNotFoundException`。
- 实际原因：Rust 已安装，但当前 PowerShell 会话的 `PATH` 没有包含 Rust 安装目录。
- 后续处理：通过临时补 PATH、安装 MSVC Build Tools、补 PowerShell profile 解决。

## 2. 重启后界面没有更新

- 表现：代码已修改，但用户看到的桌面应用界面没有变化。
- 实际原因：旧进程没有完全清理，导致用户看到的不是最新构建后的运行态。
- 后续处理：补强重启流程，先清理旧的桌面端、旧的 `python server.py` 和端口占用进程，再启动新版本。

## 3. 应用没有最小化到托盘

- 表现：关闭主窗口时没有进入托盘，而是直接退出或没有托盘行为。
- 实际原因：最初只完成了窗口启动，没有补完整的关闭转托盘逻辑。
- 后续处理：补充 Tauri 托盘菜单、关闭隐藏、托盘恢复主窗口逻辑。

## 4. 托盘没有图标

- 表现：托盘有行为但没有显示图标。
- 实际原因：托盘逻辑先完成，但没有把应用图标资源正确绑定到托盘。
- 后续处理：补充托盘图标绑定与资源配置。

## 5. FunASR 模型列表前后端口径不一致

- 表现：引擎页中 FunASR 的“可选模型”和“可下载模型”数量不一致。
- 实际原因：`/engines` 与 `/models` 的模型清单没有统一来源。
- 后续处理：统一 FunASR 模型列表为 4 个，并让前后端基于同一模型清单渲染。

## 6. 本地 `models/` 目录没有被正确识别

- 表现：项目根目录已有模型，但系统未显示为已下载。
- 实际原因：桌面端后端启动时曾读取其他运行时目录；同时注册表文件里保留了旧绝对路径。
- 后续处理：统一回项目根目录 `models/`，并增加旧路径 rebasing。

## 7. 模型目录口径不统一

- 表现：系统并非严格只认项目根目录 `models/`，还可能读取其他路径。
- 实际原因：后端配置、桌面端启动参数和注册表路径没有完全收口。
- 后续处理：明确口径为“下载到 `models/`、读取也只从 `models/`、旧路径 rebasing 到当前 `models/`”。

## 8. 原有“未下载模型展示 + 下载入口”功能丢失

- 表现：引擎页只显示已下载模型，没有显示未下载模型，也没有对应下载入口。
- 实际原因：第一次修模型页时只对已下载状态做了对齐，没有保留完整模型清单补全逻辑。
- 后续处理：前端改为先拿完整模型清单，再叠加状态，未下载模型默认显示为“未下载”。

## 9. 只有 FunASR 做了完整模型状态补全

- 表现：FunASR 能显示未下载状态，但其他引擎没有同样行为。
- 实际原因：前端当时只给 `funasr` 做了特判，其他引擎仍只依赖 `/models` 现有返回。
- 后续处理：去掉前端对 FunASR 的特判，改为所有引擎统一按完整模型清单补全状态。

## 10. 其他引擎没有下载和删除逻辑

- 表现：Whisper、WhisperCpp、Parakeet 没有像 FunASR 一样的下载和删除能力。
- 实际原因：后端 `/models/download` 和 `/models/delete` 起初只支持 FunASR。
- 后续处理：扩展后端模型状态与下载删除逻辑，让 `/models` 覆盖所有引擎，并补全对应下载入口。

## 备注

- 本文档记录的是“本次会话中由用户指出的问题”，不是完整缺陷清单。
- 部分问题之间存在因果关系，例如“界面未更新”与“旧进程未清理”是同一链路上的不同表现。

## 11. ģ��ɾ���� `/models` �Բ����ϴ� `downloaded_bytes`
- ���֣�ģ���ļ��Ѿ�ɾ����`available=false`���� `/models` ���Ա�����һ�����غ�� `downloaded_bytes`��
- ʵ��ԭ��ɾ��ģ��ʱֻ������ע������ļ���û��ͬ������ڴ��е� `model_downloads` ״̬��
- ������������ `backend/server.py` ɾ���߼��в�������״̬���ã�������֤��ɾ����� `downloaded_bytes` �ѻص� `null`��

## 12. 本地启动脚本误用 `tauri build` 导致 NSIS 打包锁住可执行文件
- 表现：执行 `scripts/start_windows_system.bat` 时，前端构建与 Rust release 编译能完成，但在 NSIS bundling 阶段报 `另一个程序正在使用此文件，进程无法访问。 (os error 32)`。
- 实际原因：本地“重建并启动应用”场景误用了 `npm run tauri:build`，它会进入安装包 bundling 流程；该流程会再次操作 `target/release/voicescribe-desktop.exe`，容易与本地运行/扫描中的 exe 发生锁冲突。
- 后续处理：把 `scripts/start_windows_system.bat` 改成仅用于本地启动，执行顺序调整为 `npm run build` + `cargo build --release` + 直接启动 `voicescribe-desktop.exe`，不再在该脚本里跑 NSIS 打包。

## 13. 本地启动脚本改成 `cargo build --release` 后，桌面窗口退回到 `localhost` 页面
- 表现：桌面应用可以启动，但界面显示“无法访问此页面 / localhost 拒绝连接 / ERR_CONNECTION_REFUSED”。
- 实际原因：把本地启动链路从 `tauri build` 改成了纯 `cargo build --release` 后，生成的可执行文件没有经过 Tauri 完整的 release 构建流程，前端资源解析语义不正确，窗口退回到 `devUrl=http://localhost:5173` 的开发地址。
- 后续处理：把 `scripts/start_windows_system.bat` 改为执行 `npx tauri build --no-bundle --ci`，保留 Tauri 正确的 release 构建流程，同时跳过 NSIS bundling。
