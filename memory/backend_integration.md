# VoiceScribe Electron 后端集成与设置持久化

> 记录日期: 2026-02-09
> 最后更新: 2026-02-09

## 概述

为 VoiceScribe Windows Electron 版本实现了 Python 后端集成、音频录制逻辑和设置持久化功能。

---

## 文件结构

| 文件路径 | 功能 | 状态 |
|---------|------|------|
| `frontend/electron/store.ts` | 基于 fs 的 JSON 文件设置持久化 | ✅ |
| `frontend/electron/backend.ts` | Python 后端 HTTP API 客户端 | ✅ |
| `frontend/electron/main.ts` | Electron 主进程（窗口、托盘、IPC） | ✅ |
| `frontend/electron/preload.ts` | Context Bridge API 暴露 | ✅ |
| `frontend/src/lib/audio-recorder.ts` | Web Audio API 录音服务 | ✅ |
| `scripts/start_backend.bat` | Windows 后端启动脚本（支持 --mock） | ✅ |
| `scripts/test_backend.bat` | Windows 后端测试脚本（绕过代理） | ✅ |

---

## Windows 适配修复

### 1. GBK 编码崩溃修复 (server.py)

**问题**: Windows 默认 GBK 编码无法输出 emoji 字符（🎭🎤✓✗），导致 `UnicodeEncodeError` 崩溃。

**修复**: 在 server.py 入口处添加 UTF-8 编码设置：

```python
if sys.platform == 'win32':
    os.environ.setdefault('PYTHONIOENCODING', 'utf-8')
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
```

### 2. 代理干扰修复 (test_backend.bat)

**问题**: 系统设置了 HTTP 代理（如 `http://127.0.0.1:7890`），curl 请求 localhost 也走代理导致 502。

**修复**: 在 bat 脚本中设置 `NO_PROXY` 并使用 `curl --noproxy "*"`。

### 3. macOS 特定提示移除

**问题**: `brew install whisper-cpp` 是 macOS 命令。

**修复**: 替换为通用提示 `Install ASR engines to enable transcription`。

---

## 核心实现

### 1. 设置持久化 (fs-based JSON)

```typescript
// electron/store.ts - 基于文件系统，非 electron-store 包
interface AppSettings {
    hotkey: HotkeyConfig;
    engine: string;      // 'funasr' | 'whisper'
    model: string;
    language: string;
    enableDiarization: boolean;
    enableAiRefine: boolean;
    outputFormat: 'clipboard' | 'file';
    launchAtLogin: boolean;
    vocabulary: string[];
}
```

存储路径: `app.getPath('userData')/settings.json`

### 2. 后端 API 客户端

```typescript
// electron/backend.ts - 使用 Node.js http 模块
checkHealth()         // GET /health
getEngines()          // GET /engines
loadEngine()          // POST /load (FormData)
transcribe()          // POST /transcribe (FormData + file stream)
getSpeakers()         // GET /speakers
registerSpeaker()     // POST /speakers/register (FormData + audio)
deleteSpeaker()       // DELETE /speakers/{id}
```

### 3. 后端进程管理

```typescript
// electron/main.ts
async function startBackendProcess() {
    // Windows: 使用 venv\Scripts\python.exe
    // 自动 spawn Python 后端
    spawn(venvPython, [serverScript], { cwd: backendDir })
    await waitForBackend()  // 等待 /health 就绪（最多30秒）
}

function stopBackendProcess() {
    // Windows: 使用 taskkill /f /t 终止进程树
    spawn('taskkill', ['/pid', String(pid), '/f', '/t']);
}
```

### 4. 音频转录流程

1. Renderer 录音 → ArrayBuffer
2. IPC `transcribe-audio` → Main Process
3. 保存临时 .webm 文件到 `os.tmpdir()`
4. POST `/transcribe` → Python 后端
5. 结果复制到剪贴板
6. 清理临时文件

---

## API 端点测试结果 (Mock 模式)

| 端点 | 方法 | 状态 | 响应示例 |
|------|------|------|---------|
| `/` | GET | ✅ | `{"status":"ok","service":"VoiceScribe","mode":"mock"}` |
| `/health` | GET | ✅ | `{"status":"healthy","mock_mode":true}` |
| `/engines` | GET | ✅ | 4 个引擎（whisper, whispercpp, funasr, parakeet） |
| `/speakers` | GET | ✅ | `{"speakers":[{"speaker_id":"mock_001","name":"Mock User"}]}` |
| `/transcribe` | POST | ✅ | 模拟中文转录结果 |
| `/load` | POST | ✅ | `{"status":"loaded (mock)"}` |
| `/speakers/{id}` | DELETE | ✅ | `{"status":"deleted (mock)"}` |

---

## IPC 处理程序

| Channel | 类型 | 功能 |
|---------|------|------|
| `get-recording-state` | handle | 获取录音状态 |
| `toggle-recording` | on | 切换录音 |
| `cancel-recording` | on | 取消录音 |
| `get-settings` / `update-settings` | handle | 读写设置 |
| `get-hotkey` / `update-hotkey` | handle | 快捷键管理 |
| `get-engines` / `load-engine` | handle | 引擎管理 |
| `get-speakers` / `delete-speaker` | handle | 说话人管理 |
| `transcribe-audio` | handle | 音频转录 |
| `check-backend` | handle | 后端健康检查 |
| `show-main-window` | on | 显示主窗口 |

---

## BAT 脚本

### start_backend.bat

- 支持 `--mock` 参数
- 自动创建 venv
- 设置 `PYTHONIOENCODING=utf-8` 和 `chcp 65001`
- Mock 模式使用 `requirements-minimal.txt`

### test_backend.bat

- 使用 `--noproxy "*"` 绕过代理
- 测试 5 个端点：`/`, `/health`, `/engines`, `/speakers`, `/transcribe`
- 显示 PASS/FAIL 计数

### install.bat

- 检查 Python 3.10+ 和 Node.js
- 创建 venv + 安装依赖
- 下载 FunASR 模型
- 安装前端 npm 包

### build.bat

- 构建 Electron TypeScript + Next.js 静态导出
- 支持 `--release` 参数

---

## 依赖

```bash
cd frontend
npm install  # 已包含所有依赖
```

关键依赖:
- `form-data`: 用于 backend.ts 的文件上传
- `electron-store`: package.json 中有但实际使用 fs-based store

---

## 待完成项

- [ ] 说话人录音（Web Audio API → 发送到后端注册）
- [ ] 模型下载进度（需要后端 WebSocket 或 SSE 支持）
- [ ] 开机自启（Windows 注册表 / Electron autoLaunch）
- [ ] 自动更新（electron-updater）
