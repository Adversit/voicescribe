# VoiceScribe BUGS

更新时间：2026-04-02

## 1. 高优先级未收口问题

### 1.1 冷启动后 `Right Alt` 不触发

状态：
- 未收口

当前事实：
- 冷启动注册链日志已存在
- 但尚未完成统一时间线下的行为定位

下一步：
- 用现有 startup trace 回归一次冷启动热键
- 确认卡在 register、resume 还是 runtime state

### 1.2 热键 Apply 后恢复慢

状态：
- 未收口

当前事实：
- 当前代码里没有对应 7-8 秒的显式等待
- 已补 shared `trace_id` 和毫秒级日志
- 还没定位真实延迟点

下一步：
- 基于共享日志定位延迟点后再改行为

### 1.3 `pyannote-3.1` 真实运行时仍未完成验收

状态：
- 未收口

当前事实：
- 缺依赖与不完整目录的错误分类已经修好
- `onnxruntime` 与 `numpy 2.x` 不再阻塞导入主链
- 但真实 gated model 下载和真实 diarization 还没验

下一步：
- 完整下载 snapshot
- 验证 token、repo 条款和运行时加载
- 用真实音频做 diarization 验收

## 2. 中优先级未收口问题

### 2.1 `Qwen3-ASR` 真实预加载与真实转录未验

状态：
- 未收口

### 2.2 `3D-Speaker` 下载后真实加载与真实转录未验

状态：
- 未收口

### 2.3 启动期 warning 未收口

涉及：
- `jieba` 的 `pkg_resources` 弃用警告
- `pydub` 的 `ffmpeg` 缺失警告
- `whisper.cpp` 不可用提示
- `Parakeet` 不可用提示

状态：
- 未修改

### 2.4 快速测试启动脚本未实现

状态：
- 未修改

当前事实：
- 现有 `scripts/start_windows_system.bat` 默认每次都会执行 `tauri build --no-bundle`
- 这就是当前启动慢的主因

## 3. 已收口但仍待人工确认的项

- 热键运行时 stale key 恢复
- observe-only runtime hook
- settings capture 期间 suspend runtime matching
- startup/apply trace diagnostics
- 悬浮窗视觉与事件桥接主链

## 4. 记录规则

- 本文件只保留当前仍有协作价值的问题
- 历史问题与完整时间线从 Git 历史查看
