# VoiceScribe Typeless 路线图

更新时间：2026-06-14

## 产品方向

VoiceScribe 的长期目标是成为 Windows 上本地优先的智能语音输入工具：

- 按下全局热键说话，停止后得到可直接发送的文本
- 本地 ASR、模型和缓存统一保存在仓库 `models/` 下
- 转写后可选择原文、轻度润色、结构化提示词、正式文本或翻译
- 支持本地 Claude Code、Codex CLI、Codex SDK 和本地 OpenAI-compatible/Ollama 无头调用
- 文本处理失败时保留并输出原始转写，不丢失用户内容
- 后续支持应用上下文、选区编辑、流式润色和更可靠的光标插入

## 阶段计划

### Phase A：统一文本处理运行时

状态：已实现首轮，进入真机验收与性能优化

- [x] 建立 Provider/Profile 正式契约
- [x] 支持 `claude_cli`、`codex_cli`、`codex_sdk`、`openai_compatible`
- [x] 原始转写和最终文本双轨保存
- [x] Provider 失败回退原文并返回结构化 warning
- [x] 设置页可配置 Profile、Provider、模型和本地 endpoint
- [x] 强化模型与缓存路径守卫
- [ ] 使用真实本地 OpenAI-compatible/Ollama 模型完成端到端推理验收
- [ ] 完成 Windows 桌面 UI、热键录音、文本处理、外部输入框输出的真机闭环
- [x] 设置页显示四类文本处理 Provider 的实时就绪探测

### Phase B：上下文感知

状态：首轮已实现，待 Windows 真机验收与规则优化

- [x] Windows 前台应用与窗口类型检测基础命令与本地分类规则
- [x] 将目标应用类别接入文本处理请求、Prompt 和 history
- [x] 按应用类别增加最小输出风格提示
- 选中文本作为可选上下文
- 明确区分“润色内容”和“执行指令”

### Phase C：低延迟体验

状态：首轮已实现，待 Windows 真机验收

- [x] 拆分桌面原始 ASR 与独立文本处理请求
- [x] 独立 `polishing` / `outputting` pipeline 状态
- [x] 统一主窗口与 Overlay 的 pipeline stage
- [x] 记录当前任务各阶段耗时
- [x] 保留旧 `/transcribe` 组合行为兼容性
- 流式润色结果展示
- 流式插入与一次性粘贴回退
- [x] 文本润色阶段可真实取消
- [ ] ASR / outputting 阶段可取消

首轮规格：`docs/PIPELINE_STATE_DESIGN.md`
取消规格：`docs/TEXT_PROCESSING_CANCELLATION_DESIGN.md`

### Phase D：风格与 Agent

状态：首轮 Style Profiles 已实现

- [x] 本地 Style Profiles 管理
- [x] 主窗口 Profile 快捷切换
- [ ] 全局热键 / 托盘 Profile 快捷切换
- 独立 Agent 执行入口
- Claude Code / Codex 多轮任务与权限策略

首轮规格：`docs/STYLE_PROFILES_DESIGN.md`
快捷切换规格：`docs/STYLE_PROFILE_QUICK_SWITCH_DESIGN.md`

### Phase E：产品收口

状态：待开始

- Windows 真机体验回归
- 安装、升级和模型迁移
- 性能、诊断、隐私和安全审计
- 发布流程与用户文档

## 长期不变量

- VoiceScribe 管理的模型和模型缓存不得以用户目录或 C 盘默认缓存作为主路径。
- 文本润色不得默认获得写文件、执行命令或网络工具权限。
- “润色文本”和“Agent 执行任务”必须是两个显式入口。
- 历史记录必须保留原始转写和最终输出，便于审计与重新处理。
- 直接输入失败时必须回退到剪贴板，并向用户提示。
