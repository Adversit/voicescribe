# VoiceScribe BUGS

更新时间：2026-04-03

## 1. 高优先级未收口问题

### 1.1 冷启动后 `Right Alt` 不触发

状态：
- 部分收口

当前事实：
- 2026-04-03 已用快速启动脚本回归冷启动日志，确认启动注册链真实存在：`use-hotkey register requested -> register_hotkey_binding -> ensure_hook_thread: startup confirmed`
- 冷启动时 runtime 绑定确实是 `0xA5`
- 现有强根因候选是 Windows 某些布局会把 `Right Alt` 当成 AltGr，上报成 `Ctrl + Right Alt`，旧的精确集合匹配会把单键 `0xA5` 漏掉
- 2026-04-03 已在 Rust runtime 中为单键 `Right Alt` 增加 AltGr 容错匹配，并补了单元测试
- 但还没完成真机冷启动 `Right Alt` 人工回归

下一步：
- 用现有 startup trace 做一次真机冷启动 `Right Alt` 回归
- 确认修复后是否仍存在只在特定输入法/键盘布局下失效的分支

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
- 2026-04-03 已确认 `<repo>/models/diarization/pyannote-3.1` 的 base snapshot 下载完成，目录内有 `config.yaml`，大小约 `10.9 MB`
- 之前把它判成“本地目录不完整”是后端规则错误；当前已修正为已下载可见
- 2026-04-03 真实调用 `ensure_diarization_loaded('pyannote-3.1')` 时，已经优先按本地 `config.yaml` 进入 pyannote 加载，不再把 Windows 本地路径误当 repo id
- 当前真实阻塞点已定位为 `pyannote/segmentation-3.0` 的 gated 依赖访问，以及 backend runtime 无法直接复用保存在 Windows Credential Manager 里的 Hugging Face token，因此真实 diarization 仍失败

下一步：
- 验证 `pyannote/segmentation-3.0` 条款是否已接受
- 让 backend runtime 能拿到可用 Hugging Face token
- 用真实音频做 diarization 验收

## 2. 中优先级未收口问题

### 2.1 `3D-Speaker` 下载后真实加载与真实转录未验

状态：
- 未收口

当前事实：
- 2026-04-03 已执行真实加载检查，`ensure_diarization_loaded('3d-speaker')` 不是“未测”，而是明确失败
- 当前 `3d-speaker` bundle 只下载了 speaker embedding 和 VAD 组件，没有 VoiceScribe 可运行的完整 diarization integration
- 原先运行时会误走通用 `modelscope speaker-diarization` 路径，现已改成返回明确 runtime 不可用错误，避免继续误判成环境偶发问题

下一步：
- 决定是否真正接入 3D-Speaker 官方 diarization 推理链
- 如果短期不接，考虑把 `3d-speaker` 从默认 diarization 推荐项降级为“下载资产已到位但运行时未实现”

## 3. 已收口但仍待人工确认的项

- 热键运行时 stale key 恢复
- observe-only runtime hook
- settings capture 期间 suspend runtime matching
- startup/apply trace diagnostics
- 悬浮窗视觉与事件桥接主链
- 2026-04-03：`AI refine` 能力不可用时原先会静默跳过且不给提示；现已改为保留原始转录，并通过 `TranscribeResult.warnings[] -> recordingFlow toast` 显式提示降级
- 2026-04-03：`/speakers/register` 曾在 CUDA 环境下因 speaker embedding 落盘链处理不当导致 500；现已改成 GPU tensor 主链，实时识别走 `torch`/CUDA，相似度计算用 `cosine_similarity`，新注册 speaker 写 `.pt`；历史 `.npy` 会在 `_load_speakers()` 阶段自动迁移成 `.pt` 并删除旧文件

## 4. 记录规则

- 本文件只保留当前仍有协作价值的问题
- 历史问题与完整时间线从 Git 历史查看
