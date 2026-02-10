# VoiceScribe Scripts

本目录包含所有构建、安装和运行脚本，按平台分类。

## 📁 目录结构

```
scripts/
├── windows/          # Windows 批处理脚本 (.bat)
│   ├── install.bat                    # 完整安装（Python + 前端，CPU 版本）
│   ├── install_gpu.bat                # GPU 支持安装（CUDA + PyTorch）
│   ├── dev.bat                        # 开发模式启动器 ⭐
│   ├── build.bat                      # 构建 Electron 应用
│   ├── package.bat                    # 打包 Electron 应用
│   ├── start_backend.bat              # 启动后端服务
│   ├── test_backend.bat               # 测试后端 API
│   └── cleanup_artifacts.bat          # 清理构建产物
│
└── unix/             # Unix/Linux/macOS Shell 脚本 (.sh)
    ├── install.sh                     # 完整安装（Python + 前端）
    ├── dev.sh                         # 开发模式启动器 ⭐
    ├── build.sh                       # 构建应用
    ├── package.sh                     # 打包应用
    ├── build_dmg.sh                   # 构建 macOS DMG
    ├── build_embedded_python.sh       # 构建嵌入式 Python
    ├── start_backend.sh               # 启动后端服务
    ├── test_backend.sh                # 测试后端 API
    └── cleanup_artifacts.sh           # 清理构建产物
```

---

## 🪟 Windows 脚本

### 1. `install.bat` - 完整安装（CPU 版本）

**功能：**
- 检查系统要求（Conda、Node.js）
- 创建 conda 环境 `voicescribe`
- 安装 Python 依赖
- 安装 PyTorch CPU 版本
- 安装 FFmpeg
- 安装前端 npm 依赖

**使用方法：**
```cmd
cd scripts\windows
install.bat
```

**注意：** 
- 默认安装 CPU 版本 PyTorch，适合没有 NVIDIA GPU 的用户
- 如需 GPU 加速，安装完成后运行 `install_gpu.bat`

---

### 2. `install_gpu.bat` - GPU 支持安装

**功能：**
- 检测 NVIDIA GPU 和驱动
- 自动检测 CUDA 版本
- 安装 PyTorch with CUDA 支持
- 使用 light-the-torch 自动匹配 CUDA 版本
- 验证 GPU 可用性

**使用方法：**
```cmd
# 先运行 install.bat，然后运行此脚本
cd scripts\windows
install_gpu.bat
```

**前置要求：**
- NVIDIA GPU
- NVIDIA 驱动已安装
- 已运行 `install.bat` 创建 conda 环境

**支持的引擎：**
- Parakeet - GPU 加速转录（推荐）
- FunASR - 也支持 GPU 加速
- Whisper - 也支持 GPU 加速

---

### 3. `dev.bat` - 开发模式启动器 ⭐

**功能：**
- 一键启动完整开发环境
- 自动启动后端服务（后台）
- 自动启动 Electron 前端（开发模式）
- 健康检查确保后端就绪
- 支持 Mock 模式

**使用方法：**
```cmd
# 正常模式（完整 ASR 引擎）
cd scripts\windows
dev.bat

# Mock 模式（无需 ASR 引擎，快速测试）
dev.bat --mock
```

**端口：**
- 后端: http://127.0.0.1:8765
- 前端: http://localhost:3000

**注意：** 这是推荐的开发方式，无需手动启动多个服务

---

### 3. `start_backend.bat` - 启动后端服务

**功能：**
- 激活 conda 环境
- 启动 FastAPI 服务器
- 支持 Mock 模式

**使用方法：**
```cmd
# 正常模式
cd scripts\windows
start_backend.bat

# Mock 模式（无需 ASR 引擎）
start_backend.bat --mock
```

**端口：** http://127.0.0.1:8765

---

### 4. `test_backend.bat` - 测试后端 API

**功能：**
- 测试所有 API 端点
- 显示 PASS/FAIL 统计
- 绕过代理设置

**使用方法：**
```cmd
cd scripts\windows
test_backend.bat
```

---

### 5. `build.bat` - 构建 Electron 应用

**功能：**
- 编译 TypeScript (Electron)
- 构建 Next.js 静态导出
- 生成 `out/` 和 `dist-electron/` 目录

**使用方法：**
```cmd
cd scripts\windows
build.bat
```

---

### 6. `package.bat` - 打包 Electron 应用

**功能：**
- 执行完整构建
- 使用 electron-builder 打包
- 生成 Windows 安装程序 (NSIS)

**使用方法：**
```cmd
cd scripts\windows
package.bat
```

**输出：** `frontend/dist/VoiceScribe Setup.exe`

---

### 7. `cleanup_artifacts.bat` - 清理构建产物

**功能：**
- 删除 `node_modules/`
- 删除 `.next/`, `out/`, `dist/`, `dist-electron/`
- 删除 Python `__pycache__/`
- 删除临时文件

**使用方法：**
```cmd
cd scripts\windows
cleanup_artifacts.bat
```

---

## 🐧 Unix/Linux/macOS 脚本

### 1. `install.sh` - 完整安装

**功能：**
- 检查系统要求（Python、Node.js、Homebrew）
- 创建 Python 虚拟环境
- 安装 Python 依赖
- 安装 FFmpeg (Homebrew)
- 安装前端 npm 依赖

**使用方法：**
```bash
cd scripts/unix
chmod +x install.sh
./install.sh
```

---

### 2. `install_backend_only.sh` - 仅安装后端

**功能：**
- 快速安装后端依赖
- 不安装前端

**使用方法：**
```bash
cd scripts/unix
chmod +x install_backend_only.sh
./install_backend_only.sh
```

---

### 3. `dev.sh` - 开发模式启动器 ⭐

**功能：**
- 一键启动完整开发环境
- 自动启动后端服务（后台）
- 自动启动 Electron 前端（开发模式）
- 健康检查确保后端就绪
- 支持 Mock 模式

**使用方法：**
```bash
# 正常模式（完整 ASR 引擎）
cd scripts/unix
./dev.sh

# Mock 模式（无需 ASR 引擎，快速测试）
./dev.sh --mock
```

**端口：**
- 后端: http://127.0.0.1:8765
- 前端: http://localhost:3000

**注意：** 这是推荐的开发方式，无需手动启动多个服务

---

### 4. `start_backend.sh` - 启动后端服务

**功能：**
- 激活虚拟环境
- 启动 FastAPI 服务器
- 支持 Mock 模式

**使用方法：**
```bash
# 正常模式
cd scripts/unix
./start_backend.sh

# Mock 模式
./start_backend.sh --mock
```

---

### 5. `test_backend.sh` - 测试后端 API

**功能：**
- 测试所有 API 端点
- 显示详细测试结果

**使用方法：**
```bash
cd scripts/unix
./test_backend.sh
```

---

### 6. `build.sh` - 构建应用

**功能：**
- 构建 Electron 应用（Linux/macOS）
- 或构建 macOS SwiftUI 应用

**使用方法：**
```bash
cd scripts/unix
./build.sh
```

---

### 7. `package.sh` - 打包应用

**功能：**
- 打包 Electron 应用
- 或打包 macOS SwiftUI 应用

**使用方法：**
```bash
cd scripts/unix
./package.sh
```

---

### 8. `build_dmg.sh` - 构建 macOS DMG

**功能：**
- 构建 macOS SwiftUI 应用
- 创建 DMG 安装包
- 代码签名（如果配置）

**使用方法：**
```bash
cd scripts/unix
./build_dmg.sh
```

---

### 9. `build_embedded_python.sh` - 构建嵌入式 Python

**功能：**
- 为 macOS 应用构建嵌入式 Python 环境
- 打包所有依赖

**使用方法：**
```bash
cd scripts/unix
./build_embedded_python.sh
```

---

### 10. `cleanup_artifacts.sh` - 清理构建产物

**功能：**
- 删除构建缓存和临时文件
- 清理 Python 和 Node.js 产物

**使用方法：**
```bash
cd scripts/unix
./cleanup_artifacts.sh
```

---

## 🚀 快速开始

### Windows 用户

1. **完整安装（CPU 版本）：**
   ```cmd
   scripts\windows\install.bat
   ```

2. **GPU 支持（可选）：**
   ```cmd
   # 如果有 NVIDIA GPU，安装 GPU 支持以获得更快的转录速度
   scripts\windows\install_gpu.bat
   ```

3. **开发模式（推荐）：**
   ```cmd
   scripts\windows\dev.bat
   ```
   这会自动启动后端和前端，无需手动操作多个窗口。

4. **或手动启动：**
   ```cmd
   # 终端 1: 启动后端
   scripts\windows\start_backend.bat
   
   # 终端 2: 启动前端
   cd frontend
   npm run dev:electron
   ```

### macOS/Linux 用户

1. **完整安装：**
   ```bash
   chmod +x scripts/unix/install.sh
   scripts/unix/install.sh
   ```

2. **开发模式（推荐）：**
   ```bash
   scripts/unix/dev.sh
   ```
   这会自动启动后端和前端，无需手动操作多个终端。

3. **或手动启动：**
   ```bash
   # 终端 1: 启动后端
   scripts/unix/start_backend.sh
   
   # 终端 2: 启动前端
   cd frontend
   npm run dev:electron
   ```

---

## 📝 注意事项

### Windows
- 需要 Anaconda 或 Miniconda
- 建议使用 PowerShell 或 CMD
- 某些脚本需要管理员权限

### macOS/Linux
- 需要 Python 3.10+
- 需要 Homebrew (macOS)
- 脚本需要执行权限 (`chmod +x`)

### 通用
- 首次运行 `install` 脚本可能需要较长时间
- 模型会在首次使用时自动下载
- 确保有足够的磁盘空间（至少 5GB）

---

## 🔧 故障排除

### 脚本无法执行
- **Windows:** 以管理员身份运行 PowerShell
- **Unix:** 添加执行权限 `chmod +x script.sh`

### Conda 环境问题
- 确保 Anaconda/Miniconda 已安装
- 重启终端后重试

### 端口占用
- 后端默认端口：8765
- 前端默认端口：3000
- 使用 `netstat` 检查端口占用

### 依赖安装失败
- 检查网络连接
- 尝试使用国内镜像源
- 查看错误日志

---

## 📚 相关文档

- [README.md](../README.md) - 项目主文档
- [memory/NEW_FEATURES.md](../memory/NEW_FEATURES.md) - 新功能说明
- [memory/RECORDING_FIX.md](../memory/RECORDING_FIX.md) - 录音功能修复
