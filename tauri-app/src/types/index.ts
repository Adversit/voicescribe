export type OutputMode = "directInput" | "clipboard" | "both";
export type HistoryMode = "stream" | "non-stream";

export interface EngineInfo {
  name: string;
  models: string[];
  loaded_model: string | null;
  available: boolean;
}

export interface Segment {
  start: number;
  end: number;
  text: string;
  speaker?: string | null;
}

export interface TranscriptionSegment extends Segment {
  id: string;
}

export interface Transcription {
  id: string;
  date: string;
  duration: number;
  text: string;
  segments: TranscriptionSegment[];
  engine: string;
  model: string;
  audioPath: string | null;
}

export interface TranscribeResult {
  text: string;
  segments: Segment[];
  duration: number;
  engine: string;
  model: string;
}

export interface ModelStatus {
  engine: string;
  model: string;
  available: boolean;
  downloading: boolean;
  size_bytes: number | null;
  downloaded_bytes: number | null;
  error: string | null;
}

export interface SpeakerInfo {
  speaker_id: string;
  name: string;
}

export interface HistorySpeakerEntry {
  speaker: string | null;
  text: string;
  timestamp: string | null;
}

export interface HistoryRecord {
  id: string;
  created_at: string;
  mode: HistoryMode;
  text: string;
  duration: number;
  engine: string;
  model: string;
  speaker_entries: HistorySpeakerEntry[];
  summary: string | null;
  retain_audio: boolean;
  audio_path: string | null;
}

export interface RealtimeEntry {
  id: string;
  speaker: string | null;
  text: string;
  timestamp: string | null;
}

export interface RealtimeSummary {
  id: string;
  createdAt: string;
  text: string;
}

export interface RealtimeSessionState {
  status: "idle" | "recording" | "streaming" | "completed" | "error";
  entries: RealtimeEntry[];
  summaries: RealtimeSummary[];
  error: string | null;
}

export interface HotkeyBinding {
  keys: number[];
  display: string;
}

export interface AppSettings {
  selectedEngine: string;
  selectedModel: string;
  language: string;
  enableDiarization: boolean;
  outputMode: OutputMode;
  hotwords: string;
  enableAIRefine: boolean;
  enableStreaming: boolean;
  enableAISummary: boolean;
  retainAudio: boolean;
  launchAtLogin: boolean;
  hotkeyBinding: HotkeyBinding;
}

export interface BackendRuntimeStatus {
  running: boolean;
  status: string;
  port: number;
  backend_dir: string;
  runtime_dir: string;
  model_dir: string;
  python_path: string | null;
  last_error: string | null;
}
