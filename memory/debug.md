# VoiceScribe Debug Notes

> Date: 2026-02-09

## Bug 1: Electron 静态导出 CSS 不加载

**症状**: Electron 加载 `out/index.html` 后界面完全无样式，Tailwind CSS 不生效

**根因**: Next.js 静态导出使用绝对路径 `/_next/static/...`，Electron `file://` 协议下 `/` 指向磁盘根目录，CSS/JS 全部 404

**修复**: `next.config.ts` 设置 `assetPrefix: "./"`

---

## Bug 2: Windows GBK 编码导致 Python 后端崩溃

**症状**: `UnicodeEncodeError: 'gbk' codec can't encode character`

**修复**: `server.py` 入口 `sys.stdout.reconfigure(encoding='utf-8', errors='replace')`

---

## Bug 3: HTTP 代理拦截 localhost 请求

**症状**: curl localhost 返回 502

**修复**: bat 脚本清除代理变量 + `curl --noproxy "*"`

---

## Bug 4: torch DLL 加载失败

**症状**: `OSError: [WinError 1114] DLL 初始化例程失败 - c10.dll`

**根因**: requirements.txt 安装的 PyTorch 与系统 CUDA 版本不匹配

**修复**: `pip3 install torch torchvision --index-url https://download.pytorch.org/whl/cu126`

---

## Bug 5: electron-builder 打包时 electron.exe 被杀毒删除

**症状**: `ENOENT: rename 'electron.exe' -> 'VoiceScribe.exe'`

**修复**: Windows Defender 排除 `frontend/dist` 目录

---

## Bug 6: dev:electron 端口冲突

**症状**: port 3000 被占用，`wait-on tcp:3000` 死等

**修复**: 使用 `next dev -p 3000` 强制端口 + `cross-env ELECTRON_START_URL=http://localhost:3000`
