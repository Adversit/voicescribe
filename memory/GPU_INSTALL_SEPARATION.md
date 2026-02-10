# GPU 安装脚本分离

## 概述

将 GPU 依赖安装从主安装脚本中分离出来，提供更灵活的安装选项。

## 修改内容

### 1. `scripts/windows/install.bat` - CPU 版本安装

**修改：**
- 移除所有 GPU 检测逻辑（nvidia-smi、CUDA 检测）
- 移除 light-the-torch 安装
- 改为只安装 PyTorch CPU 版本
- 添加 `--index-url https://download.pytorch.org/whl/cpu` 确保安装 CPU 版本
- 在结束时提示用户可以运行 `install_gpu.bat` 获取 GPU 支持

**安装步骤：**
1. 系统检查（Conda、Node.js）
2. Conda 环境创建和依赖安装
3. PyTorch CPU 版本安装
4. 前端依赖安装

### 2. `scripts/windows/install_gpu.bat` - GPU 支持安装（新建）

**功能：**
- 检测 NVIDIA GPU 和驱动（nvidia-smi）
- 自动检测 CUDA 版本
- 使用 light-the-torch 自动匹配 CUDA 版本安装 PyTorch
- 如果 light-the-torch 失败，回退到手动安装 CUDA 12.6 版本
- 详细的验证和错误提示

**安装步骤：**
1. 检查 GPU 和 CUDA
   - 运行 nvidia-smi 检测 GPU
   - 显示 GPU 型号和驱动版本
   - 检测支持的 CUDA 版本
2. 安装 PyTorch with CUDA
   - 方法 1：light-the-torch 自动检测
   - 方法 2：手动安装 CUDA 12.6（回退）
   - 验证安装和 GPU 可用性

**前置要求：**
- 必须先运行 `install.bat` 创建 conda 环境
- NVIDIA GPU 和驱动已安装

### 3. `scripts/README.md` - 文档更新

**更新内容：**
- 添加 `install_gpu.bat` 脚本说明
- 更新目录结构
- 更新快速开始指南，添加 GPU 安装步骤
- 重新编号所有脚本（1-9）

## 使用流程

### 标准安装（CPU 版本）

```cmd
cd scripts\windows
install.bat
```

适合：
- 没有 NVIDIA GPU 的用户
- 只需要基本功能的用户
- 测试和开发环境

### GPU 加速安装

```cmd
cd scripts\windows
install.bat          # 先安装 CPU 版本
install_gpu.bat      # 再安装 GPU 支持
```

适合：
- 有 NVIDIA GPU 的用户
- 需要快速转录的用户
- 使用 Parakeet 引擎的用户

## 优势

1. **灵活性**
   - 用户可以选择是否安装 GPU 支持
   - CPU 安装更快、更简单
   - GPU 安装独立，不影响 CPU 用户

2. **可靠性**
   - CPU 安装不会因为 GPU 检测失败而中断
   - GPU 安装有详细的错误提示
   - 自动检测和回退机制

3. **维护性**
   - 代码分离，更容易维护
   - GPU 相关问题不影响主安装流程
   - 更清晰的职责划分

## 支持的引擎

### CPU 版本（install.bat）
- ✅ Whisper - 所有模型
- ✅ WhisperCPP - 所有模型
- ✅ FunASR - 所有模型
- ⚠️ Parakeet - 不推荐（太慢）

### GPU 版本（install_gpu.bat）
- ✅ Whisper - GPU 加速
- ✅ WhisperCPP - GPU 加速
- ✅ FunASR - GPU 加速
- ⭐ Parakeet - GPU 加速（推荐，速度最快）

## 技术细节

### PyTorch CPU 安装

```cmd
python -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu --force-reinstall --no-deps
```

### PyTorch GPU 安装

方法 1（推荐）：
```cmd
python -m pip install light-the-torch
python -m light_the_torch install torch torchvision torchaudio --force-reinstall --no-deps
```

方法 2（回退）：
```cmd
python -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu126 --force-reinstall --no-deps
```

## 验证

### CPU 版本验证

```python
import torch
print(f'PyTorch {torch.__version__} (CPU only)')
print(f'CUDA available: {torch.cuda.is_available()}')  # 应该是 False
```

### GPU 版本验证

```python
import torch
print(f'PyTorch {torch.__version__}')
print(f'CUDA available: {torch.cuda.is_available()}')  # 应该是 True
print(f'CUDA version: {torch.version.cuda}')
print(f'GPU count: {torch.cuda.device_count()}')
for i in range(torch.cuda.device_count()):
    print(f'GPU {i}: {torch.cuda.get_device_name(i)}')
```

## 故障排除

### install.bat 问题

1. **Conda 未找到**
   - 安装 Anaconda 或 Miniconda
   - 重启终端

2. **PyTorch 安装失败**
   - 检查网络连接
   - 尝试使用国内镜像

### install_gpu.bat 问题

1. **nvidia-smi 未找到**
   - 安装 NVIDIA 驱动
   - 下载地址：https://www.nvidia.com/Download/index.aspx

2. **light-the-torch 失败**
   - 脚本会自动回退到手动安装
   - 如果仍然失败，检查 CUDA 版本兼容性

3. **CUDA 不可用**
   - 确认 GPU 驱动正确安装
   - 确认 PyTorch 版本与 CUDA 版本匹配
   - 重启电脑后重试

## 相关文件

- `scripts/windows/install.bat` - CPU 版本安装
- `scripts/windows/install_gpu.bat` - GPU 支持安装
- `scripts/README.md` - 脚本文档
- `backend/requirements.txt` - Python 依赖列表
