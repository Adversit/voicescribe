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

export interface AppSettings {
  selectedEngine: string;
  selectedModel: string;
  language: string;
  enableDiarization: boolean;
  outputMode: "directInput" | "clipboard" | "both";
  hotwords: string;
  enableAIRefine: boolean;
  hotkeyModifiers: number;
  hotkeyKeyCode: number;
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
