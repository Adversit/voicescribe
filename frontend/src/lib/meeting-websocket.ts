import type { MeetingUtterance, MeetingSummary } from "../store/meeting-store";

export interface MeetingWSOptions {
  engine: string;
  model?: string;
  speakersEnabled: boolean;
  hotwords?: string;
  enableAiRefine?: boolean;
  summaryInterval?: number;
  llmProvider?: string;
  llmModel?: string;
}

export interface MeetingWSCallbacks {
  onStarted: (sessionId: string) => void;
  onUtterance: (utterance: MeetingUtterance) => void;
  onUtteranceRefined: (id: string, text: string) => void;
  onSpeakerActive: (speaker: string, speakerId: string) => void;
  onSummary: (summary: MeetingSummary) => void;
  onSessionEnd: (data: { totalUtterances: number; duration: number; sessionData: unknown }) => void;
  onError: (message: string) => void;
}

export class MeetingWebSocket {
  private ws: WebSocket | null = null;
  private callbacks: MeetingWSCallbacks;
  private url: string;

  constructor(
    backendUrl: string = "ws://127.0.0.1:8765",
    callbacks: MeetingWSCallbacks
  ) {
    this.url = `${backendUrl}/meeting`;
    this.callbacks = callbacks;
  }

  async connect(options: MeetingWSOptions): Promise<void> {
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
            this.callbacks.onStarted(msg.session_id);
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
            });
            break;

          case "utterance_refined":
            this.callbacks.onUtteranceRefined(msg.utterance_id, msg.text);
            break;

          case "speaker_active":
            this.callbacks.onSpeakerActive(msg.speaker, msg.speaker_id);
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

          case "session_end":
            this.callbacks.onSessionEnd({
              totalUtterances: msg.total_utterances,
              duration: msg.duration,
              sessionData: msg.session_data,
            });
            break;

          case "error":
            this.callbacks.onError(msg.message);
            break;
        }
      };

      this.ws.onerror = () => {
        reject(new Error("Meeting WebSocket connection failed"));
      };

      this.ws.onclose = () => {
        this.ws = null;
      };
    });
  }

  sendAudio(pcmData: Int16Array): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(pcmData.buffer);
    }
  }

  async finish(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: "end" }));
    }
  }

  abort(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
