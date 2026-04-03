export type OutputMode = "directInput" | "clipboard" | "both";
export type HistoryMode = "stream" | "non-stream";
export type ModelCategory = "asr" | "diarization" | "speaker_mapping";

export interface EngineSelection {
  asrModel: string;
  diarizationModel: string;
  speakerMappingModel: string;
}

export type EngineSelections = Record<string, EngineSelection>;

export interface EngineInfo {
  name: string;
  display_name?: string;
  description?: string;
  asr_models: string[];
  diarization_models: string[];
  speaker_mapping_models: string[];
  default_selection: EngineSelection;
  loaded_selection: Partial<EngineSelection> | null;
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
  asrEngine: string;
  asrModel: string;
  diarizationModel: string | null;
  speakerMappingModel: string | null;
  speakerTextAlignmentLimited?: boolean;
  audioPath: string | null;
}

export interface TranscribeResult {
  text: string;
  segments: Segment[];
  duration: number;
  engine: string;
  model: string;
  asr_engine: string;
  asr_model: string;
  diarization_model: string | null;
  speaker_mapping_model: string | null;
  speaker_text_alignment_limited: boolean;
  warnings?: string[];
}

export interface ModelStatus {
  category: ModelCategory;
  engine: string;
  model: string;
  display_name: string;
  engine_scope: string[];
  available: boolean;
  downloadable: boolean;
  requires_token: boolean;
  downloading: boolean;
  loaded: boolean;
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
  asr_engine?: string;
  asr_model?: string;
  diarization_model?: string | null;
  speaker_mapping_model?: string | null;
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
  engineSelections: EngineSelections;
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
