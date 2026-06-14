export type OutputMode = "directInput" | "clipboard" | "both";
export type HistoryMode = "stream" | "non-stream";
export type ModelCategory = "asr" | "diarization" | "speaker_mapping";
export type TextProcessingProfile = "raw" | "light" | "structured" | "formal" | "translate";
export type TextProcessingProvider = "claude_cli" | "codex_cli" | "codex_sdk" | "openai_compatible";
export type TextProcessingStatus = "skipped" | "processed" | "fallback";
export type ProviderReadinessStatus = "ready" | "unconfigured" | "unavailable";
export type PipelineStage =
  | "idle"
  | "recording"
  | "transcribing"
  | "polishing"
  | "outputting"
  | "completed"
  | "cancelled"
  | "error";

export interface PipelineTimings {
  recording_ms: number;
  transcribing_ms: number;
  polishing_ms: number;
  outputting_ms: number;
  total_ms: number;
}

export interface PipelineState {
  stage: PipelineStage;
  started_at: number | null;
  stage_started_at: number | null;
  timings: PipelineTimings;
}

export interface TargetContext {
  app_kind: "code" | "chat" | "email" | "document" | "browser" | "terminal" | "other" | "unknown";
  executable_name: string | null;
  captured_at: string;
}

export interface StyleProfile {
  id: string;
  name: string;
  base_profile: Exclude<TextProcessingProfile, "raw">;
  instructions: string;
}

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
  rawText: string;
  text: string;
  segments: TranscriptionSegment[];
  engine: string;
  model: string;
  asrEngine: string;
  asrModel: string;
  diarizationModel: string | null;
  speakerMappingModel: string | null;
  speakerTextAlignmentLimited?: boolean;
  textProcessing: TextProcessingResult;
  audioPath: string | null;
}

export interface TextProcessingResult {
  raw_text: string;
  text: string;
  profile: string;
  provider: string | null;
  model: string | null;
  status: TextProcessingStatus;
  duration_ms: number;
  warning: string | null;
  target_context: TargetContext | null;
  style_profile_id: string | null;
  style_profile_name: string | null;
}

export interface TextProcessRequest {
  text: string;
  profile: TextProcessingProfile;
  provider: TextProcessingProvider;
  model: string;
  base_url: string;
  target_language: string;
  hotwords: string;
  target_context: TargetContext | null;
  style_profile: StyleProfile | null;
}

export interface ProviderReadiness {
  provider: TextProcessingProvider;
  status: ProviderReadinessStatus;
  latency_ms: number;
  detail: string;
}

export type TextProcessingTaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "fallback"
  | "cancelled"
  | "failed";

export interface TextProcessingTask {
  task_id: string;
  status: TextProcessingTaskStatus;
  result: TextProcessingResult | null;
  error: string | null;
}

export interface TranscribeResult {
  raw_text: string;
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
  text_processing: TextProcessingResult;
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
  raw_text: string;
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
  text_processing: TextProcessingResult;
  target_context: TargetContext | null;
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
  textProcessingProfile: TextProcessingProfile;
  textProcessingProvider: TextProcessingProvider;
  textProcessingModel: string;
  textProcessingBaseUrl: string;
  textProcessingTargetLanguage: string;
  styleProfiles: StyleProfile[];
  activeStyleProfileId: string | null;
  useAppContext: boolean;
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
