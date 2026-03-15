# 2026-03-12 说话人识别与增量摘要问题记录

## 背景

本轮针对会议转录链路里 4 类问题做了排查和修复：

1. 抢话、插话时多个说话人容易被并成一个人
2. 摘要策略上下文过弱，不能稳定保留短期记忆
3. 历史 `speakers.json` 编码不兼容，导致注册说话人崩溃
4. 说话人注册几次后，实时识别逐渐失效或变得不稳定
5. 下载大模型时，HuggingFace 大文件传输偶发超时

## 问题 1：说话人容易并错

### 现象

多人连续接话、打断、半重叠发言时，系统会把整句错误地归给同一个 speaker。

### 根因

有两层问题：

1. 流式 VAD 的静音收口时间过长，原先 `hangover_ms = 1500`
2. 说话人归属使用“ASR 句段中点落在哪个 diarization 区间就算谁”的粗粒度策略

### 修复

1. 将 [vad.py](/D:/learn/AIGC/voicescribe/voicescribe/backend/meeting/vad.py:10) 的 `hangover_ms` 降到 `700`
2. 将 [speaker.py](/D:/learn/AIGC/voicescribe/voicescribe/backend/diarization/speaker.py) 的说话人分配改为按“重叠时长最大”归属
3. 当一条 ASR 结果明显跨越多个 speaker 段时，按重叠比例做启发式拆分，再分别挂到对应 speaker

### 边界

当前仍然不是词级 speaker 对齐，因为 ASR 结果里还没有逐词时间戳。极端重叠说话场景只能显著改善，不能完全消除误分。

## 问题 2：摘要上下文策略不合理

### 现象

摘要虽然是周期性更新，但效果接近“每次重写整场会议”，短期上下文记忆不足。

### 目标策略

更合理的输入应为：

- 本轮新增 utterances
- 上 2 轮摘要
- 当前 `decisions` / `action_items` 状态

### 修复

在 [summarizer.py](/D:/learn/AIGC/voicescribe/voicescribe/backend/meeting/summarizer.py) 中改成：

1. 每轮只喂本轮新增发言
2. 额外带上最近 2 轮摘要
3. 额外带上累计的 `decisions` / `action_items`
4. LLM 只输出本轮新增摘要和本轮新增决策/待办
5. 服务端再把本轮结果并入 `running_summary`

同时在 [session.py](/D:/learn/AIGC/voicescribe/voicescribe/backend/meeting/session.py) 中保持跨轮累计状态。

## 问题 3：历史 `speakers.json` 编码导致注册说话人崩溃

### 现象

调用 `/speakers/register` 时，读取历史注册表失败，报错：

- `UnicodeDecodeError: 'utf-8' codec can't decode byte ...`

### 根因

本地已有的 `C:\Users\DingK\.voicescribe\speakers\speakers.json` 并不一定是 UTF-8，可能是 `gbk`、`gb18030` 或 `utf-8-sig`。

### 修复

在 [speaker.py](/D:/learn/AIGC/voicescribe/voicescribe/backend/diarization/speaker.py) 中增加兼容读取：

1. 按 `utf-8`、`utf-8-sig`、`gb18030`、`gbk` 依次尝试
2. 一旦成功读取旧文件，立即自动重写为 UTF-8
3. 后续统一按 UTF-8 管理

## 问题 4：注册几次后说话人识别逐渐失效

### 现象

实时转录开始时还能命中已注册说话人，运行一段时间或切换几次后，已注册身份开始丢失，结果退化成普通 `说话人 1/2/3`。

### 根因

在 [speaker_tracker.py](/D:/learn/AIGC/voicescribe/voicescribe/backend/meeting/speaker_tracker.py:315) 里，`reset()` 原本会连 `known_speakers` 一起清空。  
这会导致：

1. 会话重置后，已注册说话人的 embedding 缓存丢失
2. 后续新分段只能重新聚类，不能稳定回到已注册身份
3. 短句、噪声段一多，speaker identity 很快漂移

另外，实时链路里即使当前分段和已注册说话人的直接匹配分数暂时不足，只要它落入的是一个已经绑定过注册身份的 cluster，也应该尽量继承原身份，而不是立刻掉回匿名 speaker。

### 修复

在 [speaker_tracker.py](/D:/learn/AIGC/voicescribe/voicescribe/backend/meeting/speaker_tracker.py:185) 做了两处修改：

1. `reset()` 不再清空 `known_speakers`，只清理当前会话状态
2. `process_segment()` 中，如果当前分段直接匹配失败，但聚类落入已有 cluster，且该 cluster 之前已经绑定注册身份，则继承该身份

这样可以减少“注册过但后续几段就又认不出来”的退化。

## 问题 5：下载大模型时偶发 SSL / read timeout

### 现象

下载 `Qwen3-ASR`、`FireRedASR2` 这类数 GB 模型时，后端日志会出现：

- `_ssl.c:999: The handshake operation timed out`
- `The read operation timed out`
- `Trying to resume download...`

### 判断

这类日志在 HuggingFace 大文件下载里通常不代表最终失败。  
只要后面还能看到下载进度继续推进，说明底层下载器已经在断点续传。

真正需要处理的是另一点：当前服务端没有主动把 HuggingFace 的下载超时默认值拉长，弱网环境下更容易频繁抖动。

### 修复

在 [server.py](/D:/learn/AIGC/voicescribe/voicescribe/backend/server.py) 启动阶段增加了默认下载环境配置：

1. `HF_HUB_DOWNLOAD_TIMEOUT=600`
2. `HF_HUB_ETAG_TIMEOUT=60`

这不会改变下载路径，也不会影响已下载缓存；只是把大文件下载的默认超时放宽，降低网络波动时的误中断概率。

### 说明

如果日志里出现超时，但随后还有 `Trying to resume download...` 和进度继续增长，通常只需要继续等待，不必手动重下。

## 参考做法

成熟产品在说话人识别上通常不会只按句段中点贴标签，而是尽量做到更细粒度：

- Deepgram：词级 diarization
  https://developers.deepgram.com/docs/diarization
- Google Cloud Speech-to-Text：返回带 speaker tag 的词项
  https://cloud.google.com/speech-to-text/docs/multiple-voices
- AWS Transcribe：返回 `speaker_labels`
  https://docs.aws.amazon.com/transcribe/latest/dg/diarization.html
- AssemblyAI：区分 diarization 和跨录音 speaker identification
  https://www.assemblyai.com/docs/pre-recorded-audio/speaker-diarization

行业里常见路线基本是：

1. 先做 diarization
2. 再用 speaker embedding 做已注册说话人匹配
3. 有条件时做词级时间对齐，而不是句级粗贴标签

增量摘要方面，常见方法也不是每轮重喂整场全文，而是 rolling summary + short-term context window：

- Incremental temporal summarization in multi-party meetings
  https://aclanthology.org/2021.sigdial-1.55/
- Dynamic sliding window for meeting summarization
  https://www.emergentmind.com/articles/2108.13629
- Recursive summarization for long-term dialogue memory
  https://www.sciencedirect.com/science/article/pii/S0925231225008653

## 本次修改文件

- [vad.py](/D:/learn/AIGC/voicescribe/voicescribe/backend/meeting/vad.py)
- [speaker.py](/D:/learn/AIGC/voicescribe/voicescribe/backend/diarization/speaker.py)
- [summarizer.py](/D:/learn/AIGC/voicescribe/voicescribe/backend/meeting/summarizer.py)
- [session.py](/D:/learn/AIGC/voicescribe/voicescribe/backend/meeting/session.py)
- [speaker_tracker.py](/D:/learn/AIGC/voicescribe/voicescribe/backend/meeting/speaker_tracker.py)
- [server.py](/D:/learn/AIGC/voicescribe/voicescribe/backend/server.py)
- [test_vad.py](/D:/learn/AIGC/voicescribe/voicescribe/backend/tests/test_vad.py)
- [test_speaker_diarizer.py](/D:/learn/AIGC/voicescribe/voicescribe/backend/tests/test_speaker_diarizer.py)
- [test_summarizer.py](/D:/learn/AIGC/voicescribe/voicescribe/backend/tests/test_summarizer.py)
- [test_speaker_tracker.py](/D:/learn/AIGC/voicescribe/voicescribe/backend/tests/test_speaker_tracker.py)
- [2026-03-12-speaker-summary-fixes.md](/D:/learn/AIGC/voicescribe/voicescribe/docs/2026-03-12-speaker-summary-fixes.md)

## 验证

已执行：

```bash
pytest backend/tests/test_speaker_tracker.py -q
```

结果：

- `6 passed`

此前相关回归测试也已通过：

```bash
pytest tests/test_summarizer.py tests/test_speaker_diarizer.py tests/test_vad.py tests/test_session.py -q
```

结果：

- `22 passed`

## 后续建议

如果还要继续提升说话人识别稳定性，优先做这两项：

1. 加入时间平滑策略，避免短句瞬时误匹配就切换 speaker
2. 对过短音频段不做强制命名，降低噪声段误命中概率
