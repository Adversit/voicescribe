import type { SpeakerLabel, Utterance, Summary } from "../store/recording-store";

export interface StreamWSOptions {
  engine: string;
  model?: string;
  speakersEnabled: boolean;
  hotwords?: string;
  enableAiRefine?: boolean;
  enableAiSummary?: boolean;
  summaryInterval?: number;
  llmProvider?: string;
  llmModel?: string;
}

export interface StreamStartedInfo {
  sessionId: string;
  speakerBackend: string | null;
  registeredSpeakers: number;
}

export interface StreamWSCallbacks {
  onStarted: (info: StreamStartedInfo) => void;
  onUtterance: (utterance: Utterance) => void;
  onUtteranceRefined: (id: string, text: string) => void;
  onSpeakerActive: (speakers: SpeakerLabel[]) => void;
  onSummary: (summary: Summary) => void;
  onSessionEnd: (data: SessionEndData) => void;
  onError: (message: string) => void;
}

function normalizeSpeakerLabels(
  speakers: Array<{
    speaker?: string;
    speaker_id?: string;
    speakerId?: string;
    confidence?: number;
    role?: "primary" | "secondary";
  }> | null | undefined,
  fallbackSpeaker?: string,
  fallbackSpeakerId?: string,
  fallbackConfidence?: number
): SpeakerLabel[] {
  if (speakers && speakers.length > 0) {
    return speakers.map((item, index) => ({
      speaker: item.speaker || fallbackSpeaker || `Speaker ${index + 1}`,
      speakerId: item.speakerId || item.speaker_id || fallbackSpeakerId || "unknown",
      confidence: item.confidence ?? fallbackConfidence ?? 0,
      role: item.role || (index === 0 ? "primary" : "secondary"),
    }));
  }

  if (!fallbackSpeaker) {
    return [];
  }

  return [
    {
      speaker: fallbackSpeaker,
      speakerId: fallbackSpeakerId || "unknown",
      confidence: fallbackConfidence ?? 0,
      role: "primary",
    },
  ];
}

function normalizeSpeakerSpans(
  spans: Array<{
    start?: number;
    end?: number;
    speaker?: string;
    speaker_id?: string;
    speakerId?: string;
    confidence?: number;
    speakers?: Array<{
      speaker?: string;
      speaker_id?: string;
      speakerId?: string;
      confidence?: number;
      role?: "primary" | "secondary";
    }>;
    overlap_detected?: boolean;
    overlapDetected?: boolean;
    overlap_score?: number;
    overlapScore?: number;
  }> | null | undefined
) {
  if (!spans || spans.length === 0) {
    return [];
  }

  return spans.map((span) => ({
    start: span.start ?? 0,
    end: span.end ?? 0,
    speaker: span.speaker || "Speaker",
    speakerId: span.speakerId || span.speaker_id || "unknown",
    confidence: span.confidence ?? 0,
    speakers: normalizeSpeakerLabels(
      span.speakers,
      span.speaker,
      span.speakerId || span.speaker_id,
      span.confidence
    ),
    overlapDetected: Boolean(span.overlapDetected ?? span.overlap_detected),
    overlapScore:
      typeof span.overlapScore === "number"
        ? span.overlapScore
        : typeof span.overlap_score === "number"
          ? span.overlap_score
          : 0,
  }));
}

export interface SessionEndData {
  totalUtterances: number;
  duration: number;
  sessionData: unknown;
}

export class StreamWebSocket {
  private ws: WebSocket | null = null;
  private callbacks: StreamWSCallbacks;
  private url: string;
  private pendingFinish: {
    resolve: (data: SessionEndData) => void;
    reject: (err: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  } | null = null;

  constructor(
    backendUrl: string = "ws://127.0.0.1:8765",
    callbacks: StreamWSCallbacks
  ) {
    this.url = `${backendUrl}/stream`;
    this.callbacks = callbacks;
  }

  async connect(options: StreamWSOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.ws!.send(
          JSON.stringify({
            action: "start",
            engine: options.engine,
            model: options.model,
            speakers_enabled: options.speakersEnabled,
            hotwords: options.hotwords || "",
            enable_ai_refine: options.enableAiRefine ?? true,
            enable_ai_summary: options.enableAiSummary ?? true,
            summary_interval: options.summaryInterval ?? 120,
            llm_provider: options.llmProvider ?? "claude_cli",
            llm_model: options.llmModel ?? "haiku",
          })
        );
      };

      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case "started":
            this.callbacks.onStarted({
              sessionId: msg.session_id,
              speakerBackend: msg.speaker_backend ?? null,
              registeredSpeakers: msg.registered_speakers ?? 0,
            });
            resolve();
            break;

          case "utterance":
            this.callbacks.onUtterance({
              id: msg.id,
              speaker: msg.speaker,
              speakerId: msg.speaker_id,
              text: msg.text,
              start: msg.start,
              end: msg.end,
              confidence: msg.confidence,
              speakers: normalizeSpeakerLabels(
                msg.speakers,
                msg.speaker,
                msg.speaker_id,
                msg.confidence
              ),
              overlapDetected: Boolean(msg.overlap_detected),
              overlapScore:
                typeof msg.overlap_score === "number" ? msg.overlap_score : 0,
              speakerSpans: normalizeSpeakerSpans(msg.speaker_spans),
            });
            break;

          case "utterance_refined":
            this.callbacks.onUtteranceRefined(msg.utterance_id, msg.text);
            break;

          case "speaker_active":
            this.callbacks.onSpeakerActive(
              normalizeSpeakerLabels(
                msg.active_speakers,
                msg.speaker,
                msg.speaker_id
              )
            );
            break;

          case "summary":
            this.callbacks.onSummary({
              content: msg.content,
              decisions: msg.decisions || [],
              actionItems: (msg.action_items || []).map(
                (a: { assignee: string; task: string }) => ({
                  assignee: a.assignee,
                  task: a.task,
                })
              ),
              updatedAt: new Date().toISOString(),
            });
            break;

          case "session_end": {
            const endData: SessionEndData = {
              totalUtterances: msg.total_utterances,
              duration: msg.duration,
              sessionData: msg.session_data,
            };
            // Resolve pending finish promise if waiting
            if (this.pendingFinish) {
              clearTimeout(this.pendingFinish.timeout);
              this.pendingFinish.resolve(endData);
              this.pendingFinish = null;
            }
            this.callbacks.onSessionEnd(endData);
            break;
          }

          case "error":
            this.callbacks.onError(msg.message);
            break;
        }
      };

      this.ws.onerror = () => {
        reject(new Error("Stream WebSocket connection failed"));
      };

      this.ws.onclose = () => {
        // If finish() is pending and ws closed without session_end, reject
        if (this.pendingFinish) {
          clearTimeout(this.pendingFinish.timeout);
          this.pendingFinish.reject(new Error("WebSocket closed before session_end"));
          this.pendingFinish = null;
        }
        this.ws = null;
      };
    });
  }

  sendAudio(pcmData: Int16Array): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(pcmData.buffer);
    }
  }

  async finish(timeoutMs = 10000): Promise<SessionEndData> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected");
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingFinish = null;
        reject(new Error("Waiting for session_end timed out"));
      }, timeoutMs);

      this.pendingFinish = { resolve, reject, timeout };
      this.ws!.send(JSON.stringify({ action: "end" }));
    });
  }

  abort(): void {
    if (this.pendingFinish) {
      clearTimeout(this.pendingFinish.timeout);
      this.pendingFinish.reject(new Error("Stream aborted"));
      this.pendingFinish = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
