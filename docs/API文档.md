# VoiceScribe API 文档

更新时间：2026-02-23  
服务地址（默认）：`http://127.0.0.1:8765`  
实现文件：`backend/server.py`

## 1. HTTP API 总览
1. `GET /`
2. `GET /health`
3. `GET /engines`
4. `GET /models`
5. `POST /models/download`
6. `POST /models/delete`
7. `POST /load`
8. `POST /transcribe`
9. `POST /speakers/register`
10. `GET /speakers`
11. `DELETE /speakers/{speaker_id}`

## 2. 接口详情
### 2.1 `GET /`
用途：服务信息与引擎可用性  
响应示例：
```json
{
  "status": "ok",
  "service": "VoiceScribe",
  "mode": "production",
  "engines": {
    "whisper": true,
    "funasr": true,
    "diarization": true,
    "ai_refine": false
  }
}
```

### 2.2 `GET /health`
用途：健康检查  
响应字段：
- `status`
- `timestamp`
- `mock_mode`
- `available_engines`

### 2.3 `GET /engines`
用途：获取引擎与模型列表  
返回：`EngineInfo[]`  
`EngineInfo` 主要字段：
- `name`
- `models`
- `loaded_model`
- `available`
- `requires_gpu`

### 2.4 `GET /models`
用途：获取模型下载状态（当前主要为 FunASR）  
返回：`ModelStatus[]`  
`ModelStatus` 字段：
- `engine`
- `model`
- `available`
- `downloading`
- `size_bytes`
- `downloaded_bytes`
- `error`

### 2.5 `POST /models/download`
`multipart/form-data`：
- `engine`（当前仅支持 `funasr`）
- `model`

响应：
- `{"status":"started","engine":"funasr","model":"..."}`
- 或 `{"status":"already", ...}`

### 2.6 `POST /models/delete`
`multipart/form-data`：
- `engine`（当前仅支持 `funasr`）
- `model`

响应：
- `{"status":"deleted","engine":"funasr","model":"..."}`

### 2.7 `POST /load`
用途：加载引擎模型  
参数（Form 或 Query）：
- `engine`
- `model`
- `enable_diarization`（可选）

响应：
- 正常：`{"status":"loaded", ...}` 或 Mock 响应

### 2.8 `POST /transcribe`
`multipart/form-data`：
- `audio`（必填）
- `engine`（默认 `whisper`）
- `model`（默认 `large-v3`）
- `language`（默认 `zh`）
- `enable_diarization`（默认 `false`）
- `hotwords`（默认空字符串，逗号分隔）
- `enable_ai_refine`（默认 `false`）

响应（`TranscribeResult`）：
- `text`
- `segments`（每段含 `start/end/text/speaker?`）
- `duration`
- `engine`
- `model`

### 2.9 `POST /speakers/register`
`multipart/form-data`：
- `name`
- `audio`

响应：
- `{"status":"registered","speaker_id":"speaker_001","name":"xxx"}`

### 2.10 `GET /speakers`
响应：
```json
{
  "speakers": [
    { "speaker_id": "speaker_001", "name": "Alice" }
  ]
}
```

### 2.11 `DELETE /speakers/{speaker_id}`
响应：
- `{"status":"deleted","speaker_id":"speaker_001"}`

## 3. WebSocket API
### 3.1 `WS /stream`
用途：流式转写  
输入：二进制音频片段  
输出消息：
- 部分结果：
```json
{ "type": "partial", "text": "...", "segments": [] }
```
- 错误：
```json
{ "type": "error", "message": "..." }
```

## 4. 常见错误码
- `400`：参数/引擎不可用/功能未启用
- `404`：资源不存在（如 speaker_id）
- `422`：缺少必填字段（如 `engine/model`）
- `500`：服务器内部异常
