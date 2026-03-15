# VoiceScribe API 文档

更新时间：2026-03-15  
服务地址（默认）：`http://127.0.0.1:8765`  
实现文件：`backend/server.py`

## 1. HTTP API 总览

- `GET /`
- `GET /health`
- `GET /engines`
- `GET /models`
- `POST /models/download`
- `POST /models/delete`
- `POST /load`
- `POST /transcribe`
- `POST /speakers/reload-models`
- `POST /speakers/register`
- `GET /speakers`
- `DELETE /speakers/{speaker_id}`

## 2. HTTP API 详情

### 2.1 `GET /`

用途：服务信息与总体可用性探测。

### 2.2 `GET /health`

用途：健康检查。  
主要字段：
- `status`
- `timestamp`
- `mock_mode`
- `available_engines`

### 2.3 `GET /engines`

用途：获取可用引擎及模型列表。  
前端主要用于引擎设置页展示与切换。

### 2.4 `GET /models`

用途：获取已注册模型的本地状态。  
前端用于模型管理页显示下载、可用和删除状态。

### 2.5 `POST /models/download`

用途：下载模型到本地缓存。  
常用参数：
- `engine`
- `model`

### 2.6 `POST /models/delete`

用途：删除本地模型缓存。  
常用参数：
- `engine`
- `model`

### 2.7 `POST /load`

用途：加载 ASR 引擎模型。  
常用参数：
- `engine`
- `model`

说明：
- 此接口负责 ASR 引擎加载
- 说话人模型的联动 preload 由前端随后调用 `/speakers/reload-models`

### 2.8 `POST /transcribe`

用途：一次性文件转录。  
常用参数：
- `audio`
- `engine`
- `model`
- `language`
- `enable_diarization`
- `hotwords`
- `enable_ai_refine`

主要返回字段：
- `text`
- `segments`
- `duration`
- `engine`
- `model`

### 2.9 `POST /speakers/reload-models`

用途：重载 speaker backends，并按设置决定是否预加载。  
常用参数：
- `preload`
- `speaker_model`
- `enable_streaming`
- `enable_diarization`

主要返回字段：
- `status`
- `preload`
- `speaker_model`
- `speaker_plan`
- `stream_tracker`
- `diarizer_status`

说明：
- `enable_streaming=true` 时优先 preload clustering backend
- `enable_diarization=true` 时 preload mapping backend
- 当前 streaming tracker 目标链路是 `pyannote -> funasr`

### 2.10 `POST /speakers/register`

用途：注册说话人样本。  
参数：
- `name`
- `audio`

返回：
- `status`
- `speaker_id`
- `name`

### 2.11 `GET /speakers`

用途：获取已注册说话人列表。

### 2.12 `DELETE /speakers/{speaker_id}`

用途：删除已注册说话人。

## 3. WebSocket API

### 3.1 `WS /stream`

用途：通用流式转录通道。当前所有流式转录、speaker、摘要都走这个端点。

#### 客户端 `start` 消息

```json
{
  "action": "start",
  "engine": "funasr",
  "model": "seaco-paraformer",
  "speakers_enabled": true,
  "hotwords": "",
  "enable_ai_refine": true,
  "enable_ai_summary": true,
  "summary_interval": 120,
  "llm_provider": "claude_cli",
  "llm_model": "haiku"
}
```

#### 客户端音频消息

- 二进制 PCM16
- 单声道
- 16kHz

#### 客户端结束消息

```json
{ "action": "end" }
```

#### 服务端事件

`started`
```json
{
  "type": "started",
  "session_id": "abcd1234",
  "engine": "funasr",
  "speakers_enabled": true,
  "speaker_backend": "pyannote->funasr",
  "registered_speakers": 2
}
```

`utterance`
```json
{
  "type": "utterance",
  "id": "utt_0001",
  "speaker": "丁康",
  "speaker_id": "speaker_001",
  "speakers": [],
  "overlap_detected": false,
  "overlap_score": 0.0,
  "speaker_spans": [],
  "text": "你好",
  "original_text": null,
  "start": 0.0,
  "end": 1.2,
  "confidence": 0.83
}
```

`speaker_active`
```json
{
  "type": "speaker_active",
  "speaker": "丁康",
  "speaker_id": "speaker_001",
  "active_speakers": [
    {
      "speaker": "丁康",
      "speaker_id": "speaker_001",
      "confidence": 0.83,
      "role": "primary"
    }
  ]
}
```

`utterance_refined`
```json
{
  "type": "utterance_refined",
  "utterance_id": "utt_0001",
  "text": "优化后的文本"
}
```

`summary`
```json
{
  "type": "summary",
  "content": "会议摘要",
  "decisions": [],
  "action_items": []
}
```

`session_end`
```json
{
  "type": "session_end",
  "total_utterances": 10,
  "duration": 123.4,
  "session_data": {}
}
```

`error`
```json
{
  "type": "error",
  "message": "..."
}
```

## 4. 当前接口注意事项

- `/stream` 已经是当前统一流式端点，旧的 `/meeting` 方案不再是主链路
- `Qwen3-ASR`、`FireRedASR2` 当前仅支持模型管理，不支持实际推理
- `speaker_backend` 是判断流式 speaker 实际命中链路的关键字段

## 5. 常见错误码

- `400`：参数错误、依赖不可用、功能未启用
- `404`：资源不存在
- `422`：缺少必填参数
- `500`：服务内部异常
- `501`：模型已注册但推理适配尚未接入
