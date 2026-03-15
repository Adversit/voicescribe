# VoiceScribe 功能增强调研文档

> 调研日期：2026-03-08
> 调研范围：说话人识别增强、录制流程优化、热词检测改进
> 基准版本：`8ffc1a9`
> 硬件环境：RTX 4070（12GB VRAM）
> 使用场景：中文会议为主，包含英文 AI 热词

---

## 一、当前系统现状

### 1.1 说话人识别

**已实现：**
- 使用 FunASR CAM++ 模型做说话人验证（`backend/diarization/speaker.py`）
- 支持说话人注册（录制 5-10s 语音样本提取声纹 embedding）、列表、删除
- 支持说话人分离（diarize）+ 注册说话人匹配（assign_speakers）
- cosine 相似度阈值 0.7
- 存储：`~/.voicescribe/speakers/` 下 JSON manifest + `.npy` embedding
- 后端 API：`POST /speakers/register`、`GET /speakers`、`DELETE /speakers/{id}`
- 前端：SpeakerSettings 组件提供注册/管理 UI

**问题与不足：**
| 问题 | 说明 |
|------|------|
| 流式不支持 | WebSocket `/stream` 端点不包含说话人分离 |
| 无实时标注 | 转写结果中不会实时显示"谁在说话" |
| 阈值不可调 | cosine 相似度 0.7 硬编码，无 UI 配置 |
| 无置信度返回 | identify_speaker 只返回 ID，不返回匹配分数 |
| 仅支持中文模型 | CAM++ 模型为 zh-cn 专用 |
| 无多人同时说话处理 | 重叠语音场景未处理 |

### 1.2 录制流程

**已实现：**
- 全局快捷键触发 → Electron overlay 显示录音状态（波形+时长）
- 音频：16kHz/单声道/16-bit PCM，浏览器 echoCancellation + noiseSuppression
- 两条路径：非流式（录完上传）+ 流式（WebSocket，30s 分片，3s 重叠）
- 流式有 partial/final 消息协议
- 输出：clipboard / directInput / both

**问题与不足：**
| 问题 | 说明 |
|------|------|
| partial 不上屏 | 流式 partial 结果仅 console.log，用户看不到实时文字 |
| 无说话人实时标注 | 录制中不显示"谁在说什么" |
| 无实时摘要 | 缺少边录边总结能力 |
| overlay 信息单一 | 仅显示波形+时长，无文字预览 |
| 无音频质量反馈 | 不提示"麦克风太远/太吵" |
| 30s 分片粒度粗 | partial 更新间隔约 27s，体验不够"实时" |

### 1.3 热词检测

**已实现：**
- 前端 VocabularySettings 管理热词列表
- FunASR 引擎支持热词参数（`hotword` 传入 `model.generate()`）
- AI Refiner：检测英文文本时调用 Claude Haiku 做热词替换后处理
- 支持带权重格式："claude 50, deepseek 30"

**问题与不足：**
| 问题 | 说明 |
|------|------|
| Whisper 引擎无热词支持 | 仅 FunASR 有效，Whisper/Whisper.cpp 完全忽略热词 |
| 无权重配置 UI | 后端支持权重但前端只提供简单词列表 |
| AI Refiner 仅英文触发 | 纯中文文本即使有热词也不会触发 AI 修正 |
| AI Refiner 依赖外部 CLI | 需要 `claude` CLI 可用，否则静默失败 |
| 跨分片丢失上下文 | 流式 30s 分片独立转写，热词上下文可能断裂 |
| 通用 refine prompt 未使用 | `refine_prompt.txt` 存在但代码未实际使用 |

---

## 二、竞品调研

### 2.1 腾讯会议

**核心工作机制（非双引擎，而是"流式 ASR + VAD 端点检测 + 说话人分段"）：**

```
音频流 → VAD 检测说话人停顿（端点检测）
           ↓
    说话人说完一段话
           ↓
    输出该段最终转写 + 说话人标签
           ↓
    界面：[张三] 这个方案我觉得可以...
           ↓
    每隔一段时间 → AI 生成摘要/待办
```

| 能力 | 实现方式 |
|------|---------|
| 实时转写 | 微信智聆实验室自研 ASR，Transformer 架构 + LLM 预训练增强上下文，准确率 >95% |
| 说话人识别 | 按说话人段落智能划分，说完一段后标注显示 |
| AI 纪要 | 定时生成摘要快照（摘要和待办），支持混元/DeepSeek 大模型 |
| 智能章节 | 自动将录制内容划分为可浏览的章节 + 章节摘要 |
| 热词 | 企业管理员可添加自定义关键词 + 选择行业领域（v3.19.22+） |

**关键 UI 模式：**
1. 实时字幕条 — 底部滚动显示当前说话人 + 文字
2. 转写面板 — 侧边栏按说话人分段显示完整转写
3. 摘要卡片 — 定时刷新的结构化摘要（决策/待办/关键信息）
4. 章节导航 — 类似书籍目录的章节结构

### 2.2 飞书妙记

| 能力 | 说明 |
|------|------|
| 音视频转文字 | 音文同步播放 |
| 说话人识别 | 支持"重新识别说话人"，分离和标注多人发言 |
| 说话人时间线 | 点击说话人片段跳转文字 |
| 智能提取 | 关键词提取、内容摘要、待办事项 |
| 多语翻译 | 一键翻译 |

### 2.3 Otter.ai / Fireflies.ai

| 维度 | Otter.ai | Fireflies.ai |
|------|----------|-------------|
| 实时转写 | 秒级延迟 | 秒级延迟 |
| 说话人 | 自动标注（需手动命名） | 95%+ 准确率，支持 50+ 人 |
| 热词 | 自定义词汇 | 自定义词典 |
| 分析 | 基础 | 说话时长统计、话题识别 |

### 2.4 竞品核心模式总结

**所有竞品都采用相同的技术模式：**
1. **不是双引擎**（不是一个实时模型 + 一个精修模型）
2. 而是 **VAD 端点检测** → 说话人说完一段话 → 输出该段 final 转写 + 说话人标签
3. AI 摘要是**定时触发**（非实时逐字），每 N 分钟对累积文本生成结构化摘要

| 维度 | 腾讯会议 | 飞书妙记 | Otter.ai | Fireflies | **VoiceScribe 现状** |
|------|---------|---------|----------|-----------|---------------------|
| 实时转写 | VAD 分段 | 是 | 秒级 | 是 | 30s 固定分片 |
| 说话人识别 | 说完后标注 | 后处理 | 自动标注 | 95%+ | 有，但不实时 |
| AI 摘要 | 定时+会后 | 会后 | 会后 | 会后 | **无** |
| 热词 | 行业+自定义 | 无 | 自定义词汇 | 自定义词典 | FunASR 有效 |

---

## 三、技术方案详解

### 3.1 说话人识别 — 技术原理与选型

#### 3.1.1 说话人识别为什么能区分每个人？

**核心原理：声纹 embedding + 聚类**

每个人的声音具有独特的声学特征（音高、共振峰、语速、发音习惯等），这些特征可以被神经网络压缩为一个**固定长度的向量**（称为 embedding 或声纹），就像人脸识别中的 face embedding 一样。

```
                声纹识别工作原理

语音片段 → [特征提取] → 80维梅尔频谱图
              ↓
         [ECAPA-TDNN 神经网络]
              ↓
         192维 embedding 向量（声纹）
              ↓
         [余弦相似度比较]
              ↓
         相似度 > 阈值 → 同一个人
         相似度 < 阈值 → 不同的人
```

**关键技术：ECAPA-TDNN（Emphasized Channel Attention, Propagation and Aggregation TDNN）**

这是当前说话人识别领域最主流的 embedding 提取模型：

| 组件 | 作用 |
|------|------|
| 1D 卷积层（TDNN） | 捕捉语音的局部时序特征（音素级别） |
| Squeeze-Excitation（SE） | 通道注意力机制，自动强调对说话人身份最有区分度的频率通道 |
| Res2Net 残差连接 | 多尺度特征提取，同时捕捉细粒度和粗粒度的声学模式 |
| Attentive Statistical Pooling | 对整段语音做加权统计汇聚，生成固定长度向量 |

训练数据：VoxCeleb（7000+ 说话人，超 100 万条语音），让模型学习"什么特征代表说话人身份"。

**余弦相似度匹配：**
```python
# 两个声纹向量之间的余弦相似度
similarity = cos(embedding_A, embedding_B)
# 值域 [-1, 1]，越接近 1 = 越可能是同一人
# 典型阈值：0.5~0.7（根据场景调整）
```

#### 3.1.2 说话人分离（Diarization）— 谁在什么时候说话？

说话人分离解决的是"一段音频中有多个人，判断每个时间段是谁在说"的问题。

**经典流程（pyannote.audio）：**

```
完整音频
    ↓
[1] 语音活动检测（VAD）→ 哪些时间段有人说话？
    ↓
[2] 说话人分割（Segmentation）→ 在说话的时间段内，是否有说话人切换？
    ↓
[3] 声纹提取（Embedding）→ 对每个片段提取 embedding
    ↓
[4] 聚类（Clustering）→ 哪些片段属于同一个人？
    ↓
输出：[(0.0s~3.5s, Speaker_A), (3.5s~8.2s, Speaker_B), ...]
```

**pyannote 的分割模型特点：**
- 端到端重叠感知（overlap-aware）：能检测到两个人同时说话的区间
- 输出每个时间帧（每 16ms）各说话人的活动概率
- DER（Diarization Error Rate）约 10%

#### 3.1.3 实时说话人分离 — diart（推荐方案）

**为什么需要 diart 而不直接用 pyannote？**

pyannote 是离线方案 — 需要完整音频才能做全局聚类。diart 将其改造为**流式增量处理**。

**diart 工作原理：**

```
音频流（持续输入）
    ↓
[滚动缓冲区] ← 每 500ms 追加新音频
    ↓
[pyannote 分割模型] → 当前窗口内的说话人活动概率
    ↓
[pyannote embedding 模型] → 提取当前活跃说话人的声纹
    ↓
[增量聚类算法] → 与已有说话人做匹配/新建
    ↓
输出：当前谁在说话（每 500ms 更新）
```

**关键设计：**

| 机制 | 说明 |
|------|------|
| 滚动缓冲区 | 维护最近 5s 音频窗口，每 500ms 滑动一次 |
| 增量聚类 | 不需要重新处理全部历史，只将新 embedding 与已有簇比较 |
| Cannot-link 约束 | 分割模型检测到同一窗口内有两人同时说话时，阻止它们被合并到同一簇 |
| 重叠语音处理 | 分割模型的统计池化层对重叠帧降权，避免混合声纹污染 embedding |
| 延迟可调 | `latency` 参数控制 500ms~5s，越大越准但延迟越高 |

**与已注册说话人匹配：**
```python
# diart 输出 Speaker_0, Speaker_1 等匿名标签
# 我们用其 embedding 与注册声纹做余弦匹配
for cluster_id, cluster_embedding in diart_clusters:
    best_match = max(registered_speakers,
                     key=lambda s: cosine(cluster_embedding, s.embedding))
    if cosine(cluster_embedding, best_match.embedding) > threshold:
        label = best_match.name  # "张三"
    else:
        label = f"未知说话人_{cluster_id}"
```

**资源占用（RTX 4070）：**

| 组件 | 模型 | 显存 |
|------|------|------|
| 分割模型 | pyannote/segmentation-3.0 | ~300MB |
| Embedding 模型 | pyannote/embedding (ECAPA-TDNN) | ~200MB |
| **合计** | | **~500MB** |

处理延迟：每 500ms 窗口推理约 50-100ms（GPU），完全满足实时需求。

#### 3.1.4 已注册 vs 未注册说话人

| 场景 | 处理方式 |
|------|---------|
| 说话人已注册 | diart embedding → cosine 匹配 → 显示真实姓名 |
| 说话人未注册 | diart 自动分配 Speaker_0/1/2 → 用户可在会后手动标注 |
| 新人加入 | 增量聚类自动发现新簇，分配新 ID |
| 录制后注册 | 用户录完后注册新说话人，回溯匹配历史转写中的匿名说话人 |

---

### 3.2 语音转写（ASR）— 技术原理与选型

#### 3.2.1 为什么换掉 Whisper/FunASR？

**开源中文 ASR 模型精度对比（CER%，越低越好）：**

| 模型 | 参数量 | AISHELL-1 | AISHELL-2 | WenetSpeech会议 | 平均CER |
|------|--------|-----------|-----------|----------------|---------|
| **FireRedASR-AED** | 1.1B | **0.55** | 2.52 | 4.76 | **3.18** |
| FireRedASR-LLM | 8.3B | 0.76 | 2.15 | 4.67 | 3.05 |
| SenseVoice-L | 1.6B | 2.09 | 3.04 | 6.73 | 4.47 |
| Paraformer-Large（当前用） | 220M | ~1.68 | ~3.5 | ~6.0 | ~4.5 |
| Whisper-Large-v3 | 1.6B | 5.14 | 4.96 | 18.87 | **9.86** |

**结论：**
- Whisper 中文 CER 9.86%，在会议场景更差（18.87%），不适合中文会议
- 当前 Paraformer-Large CER ~4.5%，中等水平
- **FireRedASR-AED 1.1B CER 3.18%**，精度最优且参数量合理（12GB 显存可跑）
- SenseVoice 推理速度最快（10s 音频仅 70ms），但精度不如 FireRedASR

#### 3.2.2 FireRedASR-AED 技术架构

```
音频输入（16kHz 16-bit PCM）
    ↓
[特征提取] → 80 维 Log Mel 频谱图（25ms 窗口，10ms 帧移）
    ↓
[子采样模块] → 两层卷积（stride=2, kernel=3）+ ReLU
               时间分辨率从 10ms 降至 40ms/帧
    ↓
[Conformer Encoder 堆叠]
    │
    ├─ Self-Attention → 捕捉全局依赖（长距离上下文）
    ├─ Convolution → 捕捉局部依赖（音素级模式）
    ├─ Feed-Forward → 非线性变换
    └─ 交替堆叠多层 → 深度声学特征表示
    ↓
[Transformer Decoder]
    │
    ├─ Self-Attention → 已生成文字的上下文
    ├─ Cross-Attention → 关注 encoder 输出的声学特征
    ├─ Feed-Forward → 预测下一个 token
    └─ 使用 pre-norm 残差 + 权重共享
    ↓
[混合分词器] → 中文用单字，英文用 BPE（词表 7832）
    ↓
输出文本
```

**为什么 Conformer 适合语音？**
- Transformer 的 Attention 擅长全局依赖（一句话的上下文）
- CNN 擅长局部模式（单个音素的声学特征）
- Conformer = Attention + CNN，两者兼得

**训练数据规模：** 工业级中文语音数据（小红书内部数据 + 公开数据集），远超一般开源模型。

#### 3.2.3 本系统的 ASR 工作流（基于 VAD 分段）

**核心思路：不用固定 30s 分片，改用 VAD 按"说话人停顿"切段**

```
麦克风音频流
    ↓
[Silero VAD] → 检测语音活动
    │
    ├─ 检测到语音开始 → 开始缓冲音频
    ├─ 持续说话 → 继续缓冲
    └─ 检测到停顿（hangover 后确认）→ 输出该段音频
    ↓
该段音频（通常 2~30s）
    ↓
[FireRedASR-AED] → 转写
    ↓
[diart] → 该段是谁说的
    ↓
输出：{ speaker: "张三", text: "这个方案可以", start: 12.3, end: 15.8 }
```

---

### 3.3 VAD 端点检测 — 技术原理

#### 3.3.1 Silero VAD 工作原理

VAD（Voice Activity Detection）判断"当前音频帧是否有人在说话"。

**处理流程：**

```
16kHz PCM 音频流
    ↓
按 512 采样（~32ms）切块
    ↓
[Silero VAD 神经网络] → 输出语音概率 p ∈ [0, 1]
    ↓
后处理决策逻辑
```

**后处理机制（关键）：**

| 参数 | 作用 | 典型值 |
|------|------|--------|
| 语音阈值 | p > threshold 判定为语音 | 0.5 |
| 挂起时长（hangover） | 概率降到阈值以下后，仍保持"语音"状态的时间 | 300~500ms |
| 最小语音长度 | 低于此长度的语音片段视为噪声丢弃 | 250ms |
| 预缓冲（pre-roll） | 在检测到语音前，预存 100ms 音频，防止切掉词首 | 100ms |

**为什么 hangover 很重要？**
说话人在句子中间可能有短暂停顿（换气、思考），hangover 防止把一句话切成碎片。只有持续静默超过 hangover 时长，才判定为"这段话说完了"。

**性能：**
- 每个 32ms 音频块处理 < 1ms（CPU 即可）
- 支持 8kHz 和 16kHz
- 训练数据覆盖 6000+ 语言，对噪声鲁棒

#### 3.3.2 为什么用 VAD 切段而不是固定分片？

| 对比 | 固定 30s 分片（当前） | VAD 切段（目标） |
|------|---------------------|-----------------|
| 切分依据 | 固定时间 | 说话人停顿 |
| 一句话被切断 | 经常发生 | 不会 |
| 说话人归属 | 一个分片可能包含多人 | 一段通常只有一人 |
| 延迟 | 最长等 30s | 说完即出（2~15s） |
| 转写质量 | 可能切断上下文 | 完整语义单元 |

---

### 3.4 实时摘要 — 技术原理

#### 3.4.1 增量摘要工作流

```
┌─────────────────────────────────────────┐
│  转写文本持续积累                          │
│                                         │
│  [0:00] 张三: 今天讨论方案...              │
│  [0:35] 李四: 我觉得预算需要...            │
│  [1:20] 张三: 那技术可行性...              │
│  [2:15] 王五: 排期方面我建议...            │  ← 原文缓冲区
│  ...                                    │
└─────────────────────────────────────────┘
                    ↓ 每 2~3 分钟触发
┌─────────────────────────────────────────┐
│  LLM 增量摘要                            │
│                                         │
│  输入：                                  │
│    - running_summary（上次摘要）           │
│    - new_transcript（最近 N 分钟原文）     │
│                                         │
│  Prompt：                                │
│    "基于之前的摘要和新的讨论内容，           │
│     更新摘要，提取：                       │
│     1. 关键决策                           │
│     2. 待办事项（含负责人）                │
│     3. 讨论要点"                          │
│                                         │
│  输出：                                  │
│    - 更新后的 running_summary             │
│    - 结构化提取（决策/待办/关键信息）        │
└─────────────────────────────────────────┘
```

#### 3.4.2 为什么不直接对全文摘要？

| 方案 | 问题 |
|------|------|
| 全文摘要 | 1 小时会议 = 几万字，超出 LLM token 限制 |
| 固定 chunk 摘要 | 割裂上下文，跨 chunk 的讨论丢失关联 |
| **增量摘要**（推荐） | running_summary 保持全局视角，每次只处理增量，token 可控 |

#### 3.4.3 LLM 选择

| 选项 | 延迟 | 成本 | 适用 |
|------|------|------|------|
| Claude Haiku（API） | 2~5s | 低 | 定时摘要（推荐） |
| 本地小模型（Qwen-7B 等） | 5~15s | 免费 | 离线场景 |
| Claude Sonnet（API） | 3~8s | 中 | 高质量摘要 |

---

### 3.5 热词检测 — 技术原理与改进

#### 3.5.1 当前系统为什么热词效果不好？

需要确认两个关键问题：

**问题 1：是否使用了 SeACo-Paraformer（第三代热词模型）？**

FunASR 热词方案经历了三代演进：

| 代 | 技术 | 热词召回率 | 说明 |
|----|------|-----------|------|
| 第一代 | WFST（加权有限状态转换器） | 低 | 训练数据中没出现过的词无法识别 |
| 第二代 | CLAS（注意力机制） | 69% | 不稳定 |
| **第三代** | **SeACo-Paraformer**（显式偏置解码器） | **87%** | 专用热词 loss + ASF 预筛选 |

如果当前用的是普通 Paraformer 而非 SeACo-Paraformer，热词效果会差很多。

**问题 2：切换到 FireRedASR 后热词怎么办？**

FireRedASR 没有原生热词机制，需要通过 AI Refiner 后处理来弥补。

#### 3.5.2 各引擎热词方案

**FireRedASR（推荐主引擎）— 后处理方案：**

FireRedASR 本身没有热词参数，但中文 CER 3.18% 的基线精度已经很高。对于英文 AI 术语（LLM, GPT, RAG 等），通过 AI Refiner 后处理修正：

```python
# AI Refiner 热词修正
prompt = f"""
请检查以下转写文本，将可能的错误修正为正确的专业术语。
热词列表：{hotwords}
转写文本：{transcript}
仅修正明显的热词错误，保持其他内容不变。
"""
corrected = await call_llm(prompt)
```

**FunASR SeACo-Paraformer — 原生热词（如果保留 FunASR 作为备选）：**

```python
# 第三代热词：显式偏置解码器
# 热词格式：词+权重，空格分隔
result = model.generate(
    input=audio,
    hotword='LLM 30 GPT 25 Claude 20 RAG 20 Transformer 15'
)
```

技术原理：
- Attention Score Filtering（ASF）：在解码器深层注意力中预筛选与当前音频相关的热词
- 显式偏置解码器：独立的解码分支专门处理热词，有专用的训练 loss
- 支持大规模热词列表（数百个）不降性能

#### 3.5.3 AI Refiner 改进方案

当前问题和修复：

| 问题 | 修复 |
|------|------|
| 仅英文文本触发 | 改为：有热词列表即触发，不论语言 |
| 依赖 `claude` CLI | 改为：Anthropic Python SDK（HTTP API） |
| 超时 1200s 过长 | 使用流式 API，响应更快 |
| 通用 refine prompt 未使用 | 启用并允许用户自定义 |

```python
# 改进后的 AI Refiner（使用 Anthropic SDK）
import anthropic
client = anthropic.Anthropic()
response = client.messages.create(
    model="claude-haiku-4-5-20251001",
    max_tokens=1024,
    messages=[{"role": "user", "content": prompt}]
)
```

---

## 四、整体架构方案

### 4.1 目标架构

```
麦克风音频流（16kHz/16-bit/单声道）
     ↓
 ┌─────────────────────────────────────┐
 │  Silero VAD                          │
 │  - 每 32ms 判断是否有人说话            │
 │  - hangover 300ms 防止句中切断         │
 │  - 检测到停顿 → 输出该段音频           │
 └─────────────────────────────────────┘
     ↓ 一段完整语音（2~30s）
 ┌─────────────────────────────────────┐
 │  并行处理                             │
 │                                     │
 │  [FireRedASR-AED] → 转写文本          │  ~4.5GB 显存
 │  [diart 说话人分离] → Speaker ID      │  ~0.5GB 显存
 │  [已注册声纹匹配] → 真实姓名           │  CPU
 └─────────────────────────────────────┘
     ↓
 合并输出：{ speaker: "张三", text: "...", start, end }
     ↓
 ┌─────────────────────────────────────┐
 │  [AI Refiner] 热词修正（可选）         │  API 调用
 │  - 检查英文 AI 术语                    │
 │  - 修正 OCR 类错误                    │
 └─────────────────────────────────────┘
     ↓
 实时上屏（WebSocket → 前端）
     ↓
 ┌─────────────────────────────────────┐
 │  [每 2~3 分钟] LLM 增量摘要           │  API 调用
 │  - 输入：running_summary + 新转写      │
 │  - 输出：更新摘要 + 决策/待办          │
 └─────────────────────────────────────┘
```

### 4.2 显存预算（RTX 4070 12GB）

| 组件 | 显存 | 运行时机 |
|------|------|---------|
| FireRedASR-AED 1.1B | ~4.5GB | 常驻 |
| diart（分割+embedding） | ~0.5GB | 常驻 |
| Silero VAD | <50MB | 常驻 |
| **总计** | **~5GB** | 余量充足 |

### 4.3 处理延迟预估

| 环节 | 延迟 |
|------|------|
| VAD 判定停顿 | 300~500ms（hangover） |
| FireRedASR 转写 10s 音频 | ~1~2s（GPU） |
| diart 说话人匹配 | ~50ms |
| AI Refiner 热词修正 | ~2s（API） |
| **总端到端延迟** | **说完后 2~4s 出结果** |

---

## 五、实施优先级

### P0 — 核心管道搭建（2-3 周）

| # | 任务 | 技术 |
|---|------|------|
| 1 | 集成 Silero VAD 替代 30s 固定分片 | Silero VAD |
| 2 | 集成 FireRedASR-AED 替代现有 ASR | FireRedASR 1.1B |
| 3 | 集成 diart 实时说话人分离 | diart + pyannote |
| 4 | 已注册声纹匹配（复用现有 speaker.py） | cosine similarity |
| 5 | 前端实时上屏（说话人 + 文字） | WebSocket + React |

### P1 — 体验增强（2-3 周）

| # | 任务 | 技术 |
|---|------|------|
| 1 | AI Refiner 改造（SDK + 去英文限制） | Anthropic SDK |
| 2 | 热词权重 UI | React + Electron Store |
| 3 | 实时摘要 MVP | LLM 增量摘要 |
| 4 | 录制面板 UI 重构 | 说话人分色 + 摘要卡片 |

### P2 — 深度优化（3-4 周）

| # | 任务 | 技术 |
|---|------|------|
| 1 | 说话人置信度 + 阈值可配置 | UI + 后端 |
| 2 | 智能章节划分 | LLM 话题检测 |
| 3 | 说话人时间线可视化 | React 组件 |
| 4 | 录制回放 + 点击跳转 | 音频播放器 |

---

## 六、参考来源

### 产品调研
- [腾讯会议 AI 纪要](https://meeting.tencent.com/ai/summary/)
- [腾讯会议文字转写帮助](https://meeting.tencent.com/support/topic/1860/index.html)
- [腾讯会议实时字幕帮助](https://meeting.tencent.com/support/topic/1864/index.html)
- [腾讯云 ASR 大模型升级](https://www.geekpark.net/news/329964)
- [飞书妙记](https://www.feishu.cn/product/minutes)
- [Otter.ai](https://otter.ai)
- [Fireflies.ai](https://fireflies.ai)

### 模型与技术
- [FireRedASR（小红书开源 ASR）](https://github.com/FireRedTeam/FireRedASR)
- [FireRedASR 论文](https://arxiv.org/abs/2501.14350)
- [diart 实时说话人分离](https://github.com/juanmc2005/diart)
- [diart 论文](https://asmp-eurasipjournals.springeropen.com/articles/10.1186/s13636-024-00382-2)
- [pyannote.audio](https://github.com/pyannote/pyannote-audio)
- [ECAPA-TDNN 说话人 Embedding](https://huggingface.co/speechbrain/spkrec-ecapa-voxceleb)
- [Silero VAD](https://github.com/snakers4/silero-vad)
- [SenseVoice](https://github.com/FunAudioLLM/SenseVoice)
- [FunASR 第三代热词方案](https://www.nxrte.com/jishu/45848.html)
- [SeACo-Paraformer](https://www.modelscope.cn/models/damo/speech_paraformer-large-contextual_asr_nat-zh-cn-16k-common-vocab8404)
- [Deepgram 端点检测](https://developers.deepgram.com/docs/understanding-end-of-speech-detection)
- [NVIDIA 会议摘要方案](https://developer.nvidia.com/blog/boost-meeting-productivity-with-ai-powered-note-taking-and-summarization/)
- [增量摘要论文](https://arxiv.org/html/2510.06677v1)
