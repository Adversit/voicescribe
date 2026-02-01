# 调试经验教训：应用重启后转录失败

## 问题描述
VoiceScribe 应用每次重启后，转录功能失败，一直显示 "thinking"。但手动在终端启动后端时一切正常。

## 最终原因
**PATH 环境变量缺少 Homebrew 路径**，导致 FunASR 找不到 `ffmpeg`。

应用启动后端时，PATH 不包含 `/opt/homebrew/bin`，而终端环境默认包含。

## 为什么花了很长时间才找到

### 1. 关注点偏差
一直在纠结：
- Python 路径是 venv 还是系统 Python？
- 后端路径是 .app bundle 还是项目目录？
- 符号链接处理是否正确？

实际问题完全在别处。

### 2. 日志不可见
后端错误日志没有写入文件，只打印到 Swift 控制台，无法直接查看。

**添加日志写入 `/tmp/backend.log` 后，立刻看到了真正的错误：**
```
FileNotFoundError: [Errno 2] No such file or directory: 'ffmpeg'
```

### 3. 手动测试的陷阱
在终端手动测试时一切正常：
```bash
./venv/bin/python3 server.py  # 成功
curl /transcribe ...          # 成功
```

因为终端的 PATH 已经包含 `/opt/homebrew/bin`，但应用启动后端时环境变量不同。

### 4. 500 错误没有深挖
看到 `Internal Server Error` 时，没有第一时间追查完整的错误栈，而是继续猜测。

## 经验教训

| 教训 | 说明 |
|------|------|
| **先确保能看到日志** | 调试的第一步是确保能看到完整的错误信息 |
| **环境差异是常见坑** | 应用启动 vs 终端启动，环境变量往往不同 |
| **不要过度假设** | 不要假设问题在某处，要让日志告诉你 |
| **500 错误要看完整栈** | 不要只看表面错误，要找到根本原因 |

## 修复方案
在 `BackendManager.swift` 中启动后端时，添加 Homebrew 路径到 PATH：

```swift
let homebrewPaths = "/opt/homebrew/bin:/usr/local/bin"
if let existingPath = env["PATH"] {
    env["PATH"] = "\(homebrewPaths):\(existingPath)"
} else {
    env["PATH"] = "\(homebrewPaths):/usr/bin:/bin"
}
```

## 核心原则
> 如果一开始就添加日志功能，可能 5 分钟就能找到问题。
>
> **调试时，先建立可观测性，再分析问题。**
