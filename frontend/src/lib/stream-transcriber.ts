export interface StreamStartOptions {
    engine: string;
    model: string;
    language: string;
    hotwords?: string;
    enableAiRefine?: boolean;
    enableDiarization?: boolean;
}

export interface StreamResult {
    text: string;
    segments: Array<{ start: number; end: number; text: string; speaker?: string }>;
    duration: number;
    engine: string;
    model: string;
}

export class StreamTranscriber {
    private ws: WebSocket | null = null;
    private finalPromise: Promise<StreamResult> | null = null;
    private resolveFinal: ((result: StreamResult) => void) | null = null;
    private rejectFinal: ((err: Error) => void) | null = null;
    private started = false;
    private closed = false;
    private onPartial?: (text: string) => void;

    constructor(onPartial?: (text: string) => void) {
        this.onPartial = onPartial;
    }

    async start(options: StreamStartOptions): Promise<void> {
        if (this.ws) return;
        const base = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8765").replace(/^http/, "ws");
        const wsUrl = `${base}/stream`;
        this.ws = new WebSocket(wsUrl);

        this.finalPromise = new Promise<StreamResult>((resolve, reject) => {
            this.resolveFinal = resolve;
            this.rejectFinal = reject;
        });

        await new Promise<void>((resolve, reject) => {
            if (!this.ws) return reject(new Error("WebSocket not initialized"));
            this.ws.onopen = () => {
                this.ws?.send(
                    JSON.stringify({
                        action: "start",
                        engine: options.engine,
                        model: options.model,
                        language: options.language,
                        hotwords: options.hotwords || "",
                        enable_ai_refine: !!options.enableAiRefine,
                        enable_diarization: !!options.enableDiarization,
                    })
                );
                resolve();
            };
            this.ws.onerror = () => reject(new Error("WebSocket connection failed"));
            this.ws.onmessage = (evt) => {
                try {
                    const data = JSON.parse(String(evt.data));
                    if (data.type === "started") this.started = true;
                    if (data.type === "partial") this.onPartial?.(data.text || "");
                    if (data.type === "final") {
                        this.resolveFinal?.({
                            text: data.text || "",
                            segments: data.segments || [],
                            duration: data.duration || 0,
                            engine: data.engine || options.engine,
                            model: data.model || options.model,
                        });
                        this.cleanup();
                    }
                    if (data.type === "error") {
                        this.rejectFinal?.(new Error(data.message || "stream error"));
                        this.cleanup();
                    }
                } catch {
                    // ignore malformed frames
                }
            };
            this.ws.onclose = () => {
                if (!this.closed && !this.started) {
                    reject(new Error("WebSocket closed before start"));
                    return;
                }
                if (!this.closed) {
                    this.rejectFinal?.(new Error("WebSocket closed before final result"));
                    this.cleanup();
                }
            };
        });
    }

    sendChunk(chunk: Int16Array): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength));
    }

    async finish(timeoutMs = 600000): Promise<StreamResult> {
        if (!this.ws || !this.finalPromise) throw new Error("Streaming session not started");
        this.ws.send(JSON.stringify({ action: "end" }));
        return await Promise.race([
            this.finalPromise,
            new Promise<StreamResult>((_, reject) =>
                setTimeout(() => reject(new Error("stream final timeout")), timeoutMs)
            ),
        ]);
    }

    abort(): void {
        this.rejectFinal?.(new Error("stream aborted"));
        this.cleanup();
    }

    private cleanup(): void {
        this.closed = true;
        try {
            this.ws?.close();
        } catch {
            // ignore
        }
        this.ws = null;
    }
}
