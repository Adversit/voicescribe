# VoiceScribe TEST

更新时间：2026-04-02

## 1. 记录规则

- 只有写在本文件中的结果，才视为已测试
- 构建通过不等于功能完成
- 需要人工验收的项目必须明确标成待人工验收

## 2. 已完成的自动化验证

已多次通过的自动化验证类型：
- `cargo check`
- `cargo fmt`
- `npm run build`
- `cmd /c scripts/start_windows_system.bat`
- `GET /health`
- `backend/venv/Scripts/python.exe -m compileall ...`

已覆盖的主要模块：
- Tauri 桌面启动链
- 模型状态与注册表自愈
- 热键注册与诊断日志编译回归
- 历史记录 API
- `/summary`
- `/stream`
- 说话人分离服务错误分类
- `pyannote-3.1` 完整目录校验

## 3. 已确认通过的关键结果

- 模型与缓存主路径已统一到项目内 `models/`
- 历史记录基础 API 已打通
- 流式转录数据契约已打通
- 热键新结构 `HotkeyBinding { keys, display }` 已落地
- 热键运行时 stale key 恢复改动已通过一次用户人工确认
- `pyannote-3.1` 缺依赖时不再直接炸 500
- `pyannote-3.1` 不完整目录不再假装“已下载”

## 4. 待人工验收

### 4.1 热键

- 冷启动后已注册 `Right Alt` 是否稳定触发
- 设置页 Apply 后热键恢复是否仍有明显延迟
- 单键、双键、左右 Alt、AltGr 的真实录制与真实命中

### 4.2 录音与悬浮窗

- 首次开始录音后的悬浮窗显示是否稳定
- 悬浮窗停止、取消交互是否真实生效
- 波纹是否跟随真实麦克风输入
- 过短录音是否正确收口

### 4.3 页面与桌面能力

- 文本输出
- 托盘能力
- Windows 自动启动
- 历史记录页面交互体验

### 4.4 模型运行时

- `Qwen3-ASR` 真实预加载与真实转录
- `3D-Speaker` 下载后真实加载与真实转录
- `pyannote-3.1` 真实 token、真实下载、真实 diarization
- embedded Python 安装态真实闭环

## 5. 当前测试结论

当前项目状态应表述为：
- 主链代码大体已落地
- 自动化验证覆盖较多
- 多个 Windows 桌面体验项和真实模型运行时仍待人工验收

不应表述为：
- 全部完成
- 全部已修复
- 全部已验证
