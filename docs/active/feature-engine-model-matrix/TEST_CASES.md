# Test Cases: Engine Model Matrix

更新时间：2026-04-01

## 1. 测试目标

本测试文档用于验证：

1. 新模型矩阵在前端、Tauri、后端三层口径一致
2. 引擎页三块区域、兼容联动、默认组合、记忆机制正确
3. 下载 / 删除 / token / 加载 / 转录链路可用
4. 旧设置、旧历史记录、旧引擎在本轮改造后不被破坏
5. `Parakeet` 受限能力被如实表现，而不是伪装成完全对齐

## 2. 测试范围

本轮测试覆盖以下主题：

1. 引擎目录与模型状态
2. 引擎页三块区域 UI
3. 引擎联动与默认组合
4. 按引擎记忆组合
5. 本地已存在模型状态识别
6. token 输入与 Credential Manager
7. 手动预加载与首次自动加载
8. 转录命中正确执行组合
9. 旧设置迁移与旧历史兼容
10. 失败分支与回归验证

## 3. 环境前提

### 3.1 运行环境

- Windows 桌面环境
- Tauri 前端可启动
- Python 后端可启动
- 本地模型主目录固定在 [models](/D:/learn/AIGC/voicescribe/0324/voicescribe/models)

### 3.2 模型前提

至少准备以下模型状态：

1. 至少 1 个可用的 `FunASR` ASR 模型
2. 至少 1 个可用的 `Whisper` 或 `WhisperCpp` ASR 模型
3. `CampPlus Diarization` 本地已存在
4. `SOND Diarization` 本地已存在
5. `CAM++` 与 `ERes2NetV2` 至少准备可验证状态

### 3.3 凭据前提

- 如果 `pyannote 3.1` 或其他模型被定义为需要 token，需要准备：
  - 一个有效 token
  - 一个无效 token

### 3.4 数据前提

- 准备至少 1 条旧设置数据，只含 `selectedEngine / selectedModel`
- 准备至少 1 条旧历史记录，只含旧 `engine / model` 字段
- 准备至少 1 条包含双说话人的测试音频
- 准备至少 1 条短音频 / 静音音频 / 单说话人音频

## 4. 自动化检查

### 4.1 前端检查

- [x] A1 前端类型检查通过
- [x] A2 前端构建通过
- [x] A3 引擎页相关代码无明显类型回退到 `any`

### 4.2 Rust / Tauri 检查

- [x] A4 Rust 编译通过
- [ ] A5 Tauri 命令注册完整，新增凭据命令可调用
- [ ] A6 桌面端转录命令能接收扩展后的完整 payload

### 4.3 后端检查

- [x] A7 后端启动通过
- [x] A8 `/engines` 返回新目录结构
- [x] A9 `/models` 返回三类模型统一状态
- [x] A10 `/load` 能接收完整模型组合
- [x] A11 `/transcribe` 能接收完整模型组合

## 5. 手动功能验收

### 5.1 引擎页基础结构

- [ ] M1 引擎页存在 3 个固定区域：`ASR 模型 / 说话人分离模型 / 说话人映射模型`
- [ ] M2 三个区域都能显示状态、下载、删除、加载入口
- [ ] M3 旧引擎 `Whisper / WhisperCpp / Parakeet` 不再表现成“只有 ASR”

### 5.2 引擎切换与默认组合

- [ ] M4 切到 `FunASR` 时，默认自动带出 `FunASR 内置分离 + CAM++`
- [ ] M5 切到 `Qwen3-ASR` 时，默认自动带出 `3D-Speaker + CAM++`
- [ ] M6 切到 `Whisper / WhisperCpp / Parakeet` 时，默认自动带出 `3D-Speaker + CAM++`
- [ ] M7 `FunASR` 下允许选择 `FunASR 内置分离`
- [ ] M8 非 `FunASR` 引擎下不允许选择 `FunASR 内置分离`

### 5.3 按引擎记住组合

- [ ] M9 手动修改 `FunASR` 组合后切走再切回，恢复上次组合
- [ ] M10 手动修改 `Whisper` 组合后切走再切回，恢复上次组合
- [ ] M11 不同引擎之间的组合记忆互不污染

### 5.4 本地已存在模型识别

- [ ] M12 `CampPlus Diarization` 启动后自动显示为已下载
- [ ] M13 `SOND Diarization` 启动后自动显示为已下载
- [ ] M14 对这两个本地已存在模型不要求先重新下载才可选

### 5.5 下载 / 删除 / 状态展示

- [ ] M15 可下载新的 ASR 模型
- [ ] M16 可下载新的说话人分离模型
- [ ] M17 可下载新的说话人映射模型
- [ ] M18 删除后状态立即从已下载变为未下载或不可用
- [ ] M19 删除当前所选模型后，当前选择被保留并标红，而不是静默改默认

### 5.6 token 输入与凭据复用

- [ ] M20 下载需要 token 的模型时会弹出 token 输入窗口
- [ ] M21 弹窗中能明确看到当前目标模型名称
- [ ] M22 输入有效 token 后下载继续执行
- [ ] M23 同一模型再次下载时，如果 token 已保存，不重复弹窗
- [ ] M24 覆盖 token 后再次下载可生效

### 5.7 手动预加载与自动加载

- [ ] M25 点击手动预加载时，按当前三段组合加载
- [ ] M26 未预加载时，首次转录会自动加载当前组合
- [ ] M27 日志能区分“手动预加载”与“首次自动加载”

### 5.8 转录执行链路

- [ ] M28 `enableDiarization=false` 时，转录只跑 ASR，不执行分离 / 映射
- [ ] M29 `enableDiarization=true` 时，转录严格执行当前显式选择的分离模型
- [ ] M30 `FunASR` 选择 `funasr_builtin` 时，日志命中内置路径
- [ ] M31 `FunASR` 选择外部分离模型时，日志命中外部分离路径
- [ ] M32 `Qwen3-ASR` 能使用默认组合完成一次转录
- [ ] M33 `Whisper / WhisperCpp` 能使用外部分离 + 映射组合完成一次转录
- [ ] M34 `Parakeet` 能进入矩阵并完成本轮允许的受限转录路径

### 5.9 转录结果与历史记录

- [ ] M35 转录结果对象保留 `asr_engine / asr_model / diarization_model / speaker_mapping_model`
- [ ] M36 历史记录对象保留 `diarization_model / speaker_mapping_model`
- [ ] M37 新写入历史记录后，仍可正常打开历史页
- [ ] M38 旧历史记录在缺少新字段时仍可读取，不崩溃

### 5.10 旧设置迁移

- [ ] M39 旧设置中的 `selectedEngine / selectedModel` 被保留
- [ ] M40 如果旧模型未下载，只显示未下载状态，不自动改写
- [ ] M41 迁移后每个引擎都得到默认的分离模型与映射模型
- [ ] M42 如果旧模型已失效，保留原值并标红

## 6. 失败分支验证

### 6.1 未下载

- [ ] F1 当前所选分离模型未下载时，页面明确提示未下载
- [ ] F2 未下载模型不应伪装成可执行

### 6.2 删除后失效

- [ ] F3 删除当前所选模型后，页面标红并提示修复
- [ ] F4 删除模型后系统不自动切换到另一套隐式组合

### 6.3 token 缺失或无效

- [ ] F5 token 缺失时，下载前强制弹窗
- [ ] F6 token 无效时，错误信息表现为认证失败，而不是泛化成普通下载失败
- [ ] F7 token 失败后允许重新输入并重试

### 6.4 加载失败

- [ ] F8 加载失败时，能指出是哪个模型失败
- [ ] F9 加载失败后不自动回退到另一条执行路径

### 6.5 不兼容组合

- [ ] F10 前端尽量在选择阶段阻止不兼容组合
- [ ] F11 若仍收到不兼容请求，后端明确拒绝执行

### 6.6 运行时环境缺失

- [ ] F12 缺依赖时，模型显示为不可用或加载失败
- [ ] F13 不把不可用模型显示为“已就绪”

### 6.7 Parakeet 受限路径

- [ ] F14 `Parakeet` 结果能力受限时，日志与测试记录明确说明
- [ ] F15 不把 `Parakeet` 的受限结果误报成“完全支持说话人文本对齐”

## 7. 回归验证

### 7.1 旧引擎回归

- [ ] R1 `FunASR` 原有 ASR 基本能力未被破坏
- [ ] R2 `Whisper` 原有 ASR 基本能力未被破坏
- [ ] R3 `WhisperCpp` 原有 ASR 基本能力未被破坏
- [ ] R4 `Parakeet` 原有 ASR 基本能力未被破坏

### 7.2 引擎页回归

- [ ] R5 引擎页原有下载状态显示仍正常
- [ ] R6 引擎页原有加载入口未消失
- [ ] R7 未启用说话人链路时，不影响单纯 ASR 使用

### 7.3 录音与主转录流程回归

- [ ] R8 录音完成后仍能正常进入主转录流程
- [ ] R9 主转录流程不会因新增组合字段而崩溃
- [ ] R10 历史记录仍可写入、读取、删除

### 7.4 模型路径回归

- [ ] R11 新下载模型主路径仍落在 [models](/D:/learn/AIGC/voicescribe/0324/voicescribe/models)
- [ ] R12 不把新增模型主路径切回用户目录默认缓存

## 8. 结果记录模板

每次执行测试时，按以下格式补记录：

```md
### [用例编号] 用例标题

- 日期：
- 执行人：
- 环境：
- 输入：
- 结果：通过 / 失败 / 部分通过
- 证据：
- 备注：
```

## 9. 结果记录规则

1. 没有写进正式测试记录的，视为没测
2. 构建通过不等于功能已验证
3. 手动验收项如果尚未执行，必须明确标记“待人工验收”
4. 本专题的测试结果优先写回当前专题测试记录；如果后续阶段状态文档指定新的统一测试记录，再按新规则迁移
5. 新发现的 bug 需要同步写入对应 bug 文档，不能只留在对话里

## 10. 本轮执行记录

### [A1-A3] 前端类型检查、构建与显式 `any` 扫描

- 日期：2026-04-01
- 执行人：Codex
- 环境：Windows PowerShell，仓库根目录
- 输入：
  - `cmd /c "cd /d tauri-app && npm run build"`
  - `rg -n "\\bany\\b" tauri-app/src/types/index.ts tauri-app/src/stores/appStore.ts tauri-app/src/stores/modelStore.ts tauri-app/src/api/backend.ts tauri-app/src/api/tauri.ts tauri-app/src/lib/recordingFlow.ts tauri-app/src/pages/EngineSettings.tsx tauri-app/src/pages/GeneralSettings.tsx tauri-app/src/pages/HistoryPage.tsx`
- 结果：通过
- 证据：
  - `npm run build` 实际执行 `tsc --noEmit && vite build`
  - Vite 生产构建通过
  - `rg` 未匹配到显式 `any`
- 备注：A1/A2/A3 已勾选

### [A4] Rust / Tauri 编译检查

- 日期：2026-04-01
- 执行人：Codex
- 环境：`tauri-app/src-tauri`
- 输入：`cargo check`
- 结果：通过
- 证据：`Finished 'dev' profile [unoptimized + debuginfo] target(s) in 37.11s`
- 备注：A4 已勾选；A5/A6 仍待桌面端实际调用验证

### [A7-A11] 后端 mock 启动与接口契约烟雾测试

- 日期：2026-04-01
- 执行人：Codex
- 环境：Windows PowerShell，`backend/server.py --mock --host 127.0.0.1 --port 8876/8879/8880`
- 输入：
  - `GET /engines`
  - `GET /models`
  - `POST /load` with `asr_engine=funasr asr_model=seaco-paraformer diarization_model=funasr_builtin speaker_mapping_model=campp enable_diarization=true`
  - `POST /transcribe` with `.tmp-tests/silence-6s.wav`
- 结果：通过
- 证据：
  - `/engines` 返回 5 个引擎：`funasr,qwen3_asr,whisper,whispercpp,parakeet`
  - `FunASR` 默认组合：`seaco-paraformer + funasr_builtin + campp`
  - `Qwen3-ASR` 默认组合：`qwen3-asr-1.7b + 3d-speaker + campp`
  - `/models` 返回 25 条模型状态，含 `asr / diarization / speaker_mapping`
  - `CampPlus Diarization`、`SOND Diarization` 在目录中可见且状态为可用
  - `pyannote-3.1` 标记 `requires_token=true`
  - `/load` 返回 `status=loaded`，并回显完整组合字段
  - `/transcribe` 在 `enable_diarization=true` 时回显 `diarization_model=campplus-diarization`、`speaker_mapping_model=campp`
  - `/transcribe` 在 `enable_diarization=false` 时回显的 `diarization_model / speaker_mapping_model` 为 `null`
- 备注：A7/A8/A9/A10/A11 已勾选；本轮为 mock 契约验证，不代表真实模型运行时全部完成

## 11. 当前阻塞与待人工验收

- A5 `Tauri` 新增凭据命令尚未实现，当前不能勾选
- A6 还未通过桌面端真实 `invoke` 链路验证扩展后的转录 payload
- M1-M42 绝大多数 UI / 交互 / 真实模型能力项仍待人工验收
- `3d-speaker` 与 `pyannote-3.1` 当前只进入目录和界面范围，运行时尚未正式接通
- token 弹窗与 Windows Credential Manager 仍未实现，M20-M24、F5-F7 当前不能通过
