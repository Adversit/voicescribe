# Tasks: Engine Model Matrix

更新时间：2026-04-01

## 1. 任务目标

本清单用于把 `FEATURE_REQUEST -> SPEC -> DESIGN` 收口为可执行任务。

本轮任务不是单页 UI 补丁，而是一次跨：

- 前端状态与页面
- Tauri / Rust 桥接
- Python 后端目录与转录链路
- 模型下载与 token
- 旧设置 / 旧历史兼容

的联动改造。

## 2. 执行顺序

本轮推荐执行顺序固定如下：

1. 文档冻结
2. 后端目录与契约
3. 前端类型与设置迁移
4. 引擎页三块区域 UI
5. Tauri token / 转录桥接
6. 后端加载与转录链路
7. 历史记录与结果结构
8. 验证、回写、收口

## 3. 文档冻结任务

- [x] T1 复核 [FEATURE_REQUEST.md](/D:/learn/AIGC/voicescribe/0324/voicescribe/docs/active/feature-engine-model-matrix/FEATURE_REQUEST.md) 与当前代码现状是否一致
- [x] T2 复核 [SPEC.md](/D:/learn/AIGC/voicescribe/0324/voicescribe/docs/active/feature-engine-model-matrix/SPEC.md) 的兼容矩阵、默认组合、迁移规则、失败分支
- [x] T3 复核 [DESIGN.md](/D:/learn/AIGC/voicescribe/0324/voicescribe/docs/active/feature-engine-model-matrix/DESIGN.md) 的分层职责、接口方案、拆分策略
- [x] T4 冻结本轮文档口径，后续实现不再私自发明第二套规则

## 4. 后端目录与契约任务

### 4.1 模型目录与兼容矩阵

- [x] T5 在后端建立正式的引擎目录定义，覆盖 `funasr / qwen3_asr / whisper / whispercpp / parakeet`
- [x] T6 在后端建立三类模型分类：`asr / diarization / speaker_mapping`
- [x] T7 在后端建立兼容矩阵与默认组合，不再只靠 `ENGINE_MODEL_CATALOG`
- [x] T8 把 `CampPlus Diarization` 和 `SOND Diarization` 作为正式分离模型接入目录
- [x] T9 把 `Qwen3-ASR-1.7B` 注册为 `Qwen3-ASR` 引擎下的正式 ASR 模型

### 4.2 接口契约

- [x] T10 扩展 `/engines`，使其能返回引擎可选 ASR / diarization / speaker_mapping 与默认组合
- [x] T11 扩展 `/models`，使其能返回三类模型的统一状态结构
- [x] T12 扩展 `/models/download` 为显式分类下载契约
- [x] T13 扩展 `/models/delete` 为显式分类删除契约
- [x] T14 扩展 `/load` 为“整套组合加载”契约
- [x] T15 扩展 `/transcribe` 为显式 `asr_engine / asr_model / diarization_model / speaker_mapping_model` 契约

## 5. `server.py` 渐进式拆分任务

- [ ] T16 从 [server.py](/D:/learn/AIGC/voicescribe/0324/voicescribe/backend/server.py) 中抽出 `model_catalog` 服务层
- [ ] T17 从 [server.py](/D:/learn/AIGC/voicescribe/0324/voicescribe/backend/server.py) 中抽出 `model_registry` 服务层
- [ ] T18 从 [server.py](/D:/learn/AIGC/voicescribe/0324/voicescribe/backend/server.py) 中抽出 `transcription_service` 服务层
- [ ] T19 视实现进度决定是否同步抽出 `history_service`
- [ ] T20 保持 `server.py` 为 FastAPI 入口层，不在本轮再继续向里堆新业务规则

## 6. 运行时与引擎任务

### 6.1 说话人运行时

- [x] T21 将 [speaker.py](/D:/learn/AIGC/voicescribe/0324/voicescribe/backend/diarization/speaker.py) 从“单套 diarization + sv runtime”改为可选模型矩阵
- [ ] T22 支持外部分离模型：`campplus-diarization / sond-diarization / 3d-speaker / pyannote-3.1`
- [x] T23 支持映射模型：`campp / eres2netv2`
- [x] T24 保证 `FunASR` 下 `funasr_builtin` 与外部分离严格显式二选一

### 6.2 ASR 引擎接入

- [x] T25 新增 [qwen3_asr_engine.py](/D:/learn/AIGC/voicescribe/0324/voicescribe/backend/engines/qwen3_asr_engine.py) 并接入后端目录
- [ ] T26 更新 [funasr_engine.py](/D:/learn/AIGC/voicescribe/0324/voicescribe/backend/engines/funasr_engine.py) 以支持内置分离与外部分离并行路径
- [ ] T27 更新 [whisper_engine.py](/D:/learn/AIGC/voicescribe/0324/voicescribe/backend/engines/whisper_engine.py) 对接外部说话人链路
- [ ] T28 更新 [whispercpp_engine.py](/D:/learn/AIGC/voicescribe/0324/voicescribe/backend/engines/whispercpp_engine.py) 对接外部说话人链路
- [ ] T29 更新 [parakeet_engine.py](/D:/learn/AIGC/voicescribe/0324/voicescribe/backend/engines/parakeet_engine.py) 接入矩阵并保留本轮受限路径说明

## 7. 前端类型与设置任务

- [x] T30 扩展 [index.ts](/D:/learn/AIGC/voicescribe/0324/voicescribe/tauri-app/src/types/index.ts) 中的 `EngineInfo / ModelStatus / AppSettings / TranscribeResult / HistoryRecord`
- [x] T31 新增按引擎记住组合的设置结构，例如 `engineSelections`
- [x] T32 在 [appStore.ts](/D:/learn/AIGC/voicescribe/0324/voicescribe/tauri-app/src/stores/appStore.ts) 中实现旧设置迁移
- [x] T33 保留旧 `selectedEngine / selectedModel` 迁移语义，不静默重写
- [x] T34 保证旧历史记录在缺少新字段时仍可安全读取

## 8. 前端页面与交互任务

### 8.1 引擎页

- [x] T35 将 [EngineSettings.tsx](/D:/learn/AIGC/voicescribe/0324/voicescribe/tauri-app/src/pages/EngineSettings.tsx) 重构为三块固定区域
- [x] T36 为三类模型分别提供选择、下载、删除、状态展示
- [x] T37 实现按引擎联动的可选范围、默认组合与禁用控制
- [x] T38 实现失效组合保留并标红
- [x] T39 为当前所选组合提供手动预加载入口

### 8.2 通用设置与文案

- [x] T40 更新 [GeneralSettings.tsx](/D:/learn/AIGC/voicescribe/0324/voicescribe/tauri-app/src/pages/GeneralSettings.tsx) 中 `enableDiarization` 的展示文案，使其从“说话人识别”升级为更准确的说话人链路总开关

### 8.3 主转录链

- [x] T41 更新 [recordingFlow.ts](/D:/learn/AIGC/voicescribe/0324/voicescribe/tauri-app/src/lib/recordingFlow.ts) 读取当前完整组合而不是只读 `selectedModel`
- [x] T42 更新前端调 Tauri 的转录 payload，显式带上分离模型与映射模型
- [x] T43 更新转录成功后的历史记录写入结构，保留实际执行组合

## 9. Tauri / Rust 任务

- [x] T44 扩展 [tauri.ts](/D:/learn/AIGC/voicescribe/0324/voicescribe/tauri-app/src/api/tauri.ts) 的转录请求结构
- [x] T45 扩展 [backend.rs](/D:/learn/AIGC/voicescribe/0324/voicescribe/tauri-app/src-tauri/src/commands/backend.rs) 的 `transcribe` 命令参数
- [x] T46 在 [lib.rs](/D:/learn/AIGC/voicescribe/0324/voicescribe/tauri-app/src-tauri/src/lib.rs) 注册新增凭据命令
- [x] T47 新增 Windows Credential Manager 的读 / 写 / 覆盖 / 删除命令
- [x] T48 保持 Tauri 只处理原生能力，不在 Rust 层维护兼容矩阵

## 10. 下载与凭据任务

- [x] T49 建立“按模型需要 token”判断与前端弹窗触发链路
- [x] T50 新增 token 输入弹窗组件
- [x] T51 token 保存到 Windows Credential Manager，而不是 `.env` 或普通设置文件
- [x] T52 已保存 token 的模型再次下载时不重复弹窗
- [x] T53 下载失败时保留失败原因并允许重试
- [ ] T54 所有新模型主下载路径固定在 [models](/D:/learn/AIGC/voicescribe/0324/voicescribe/models)

## 11. 加载与执行链路任务

- [x] T55 实现手动预加载整套组合
- [x] T56 实现首次使用时的自动加载
- [x] T57 日志区分“手动预加载命中”与“首次自动加载”
- [x] T58 `enableDiarization=false` 时跳过分离 / 映射执行，但保留当前选择
- [x] T59 `enableDiarization=true` 时严格执行当前显式所选组合
- [x] T60 加载失败时不自动切换到另一条隐式路径

## 12. 历史记录与结果对象任务

- [x] T61 扩展转录结果对象以保留 `diarization_model / speaker_mapping_model`
- [x] T62 扩展历史记录对象以保留 `diarization_model / speaker_mapping_model`
- [x] T63 保证旧历史记录兼容读取
- [x] T64 如需在历史详情页展示新字段，补充 UI 展示

## 13. 验证与回写任务

- [x] T65 完成 [TEST_CASES.md](/D:/learn/AIGC/voicescribe/0324/voicescribe/docs/active/feature-engine-model-matrix/TEST_CASES.md) 正式用例
- [x] T66 执行前端静态检查 / 构建检查
- [x] T67 执行 Rust 构建检查
- [x] T68 执行后端启动 / 接口 / 目录检查
- [ ] T69 执行手动功能验收
- [x] T70 将测试结果回写到正式测试记录
- [ ] T71 将新增 bug 回写到正式 bug 记录

## 14. 完成定义

以下条件全部满足，才可将本专题标记为完成：

- [ ] D1 文档口径与代码行为一致
- [ ] D2 引擎页三块区域可用
- [ ] D3 `Qwen3-ASR` 引擎与 `Qwen3-ASR-1.7B` 可见
- [ ] D4 `CampPlus Diarization` 与 `SOND Diarization` 作为正式项接入
- [ ] D5 手动预加载与首次自动加载都可用
- [ ] D6 token 弹窗与 Credential Manager 链路可用
- [ ] D7 旧设置迁移不丢原 `selectedEngine / selectedModel`
- [ ] D8 旧历史记录可继续读取
- [ ] D9 转录结果与历史记录都能保留完整模型组合
- [ ] D10 测试结果已经写入正式测试记录后再对外汇报
