// WAV recorder for Electron renderer.
// Records mono PCM at a target sample rate and exposes a simple start/stop API.
//
// Rationale:
// - MediaRecorder usually outputs opus/webm in Chromium, while backend expects WAV.
// - This implementation captures raw PCM via WebAudio and encodes a standard RIFF WAV.

export interface WavRecorderOptions {
    targetSampleRate?: number; // Hz, default 16000
    channelCount?: 1; // currently only mono is supported
    echoCancellation?: boolean;
    noiseSuppression?: boolean;
}

function writeAscii(view: DataView, offset: number, text: string) {
    for (let i = 0; i < text.length; i++) {
        view.setUint8(offset + i, text.charCodeAt(i) & 0xff);
    }
}

function clamp01(v: number): number {
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(1, v));
}

function floatToDbfs(rms: number): number {
    if (rms <= 0) return -60;
    const db = 20 * Math.log10(rms);
    // Clamp to a practical range similar to the SwiftUI mapping.
    return Math.max(-60, Math.min(0, db));
}

function rmsLevel(samples: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
    const rms = Math.sqrt(sum / Math.max(1, samples.length));
    const db = floatToDbfs(rms);
    return clamp01((db + 60) / 60);
}

function downsampleToInt16(
    input: Float32Array,
    inputSampleRate: number,
    targetSampleRate: number
): Int16Array {
    if (targetSampleRate >= inputSampleRate) {
        const out = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
            const s = Math.max(-1, Math.min(1, input[i]));
            out[i] = (s * 0x7fff) | 0;
        }
        return out;
    }

    const ratio = inputSampleRate / targetSampleRate;
    const newLength = Math.max(1, Math.round(input.length / ratio));
    const result = new Int16Array(newLength);

    let offsetBuffer = 0;
    for (let i = 0; i < newLength; i++) {
        const nextOffsetBuffer = Math.round((i + 1) * ratio);
        let accum = 0;
        let count = 0;
        for (let j = offsetBuffer; j < nextOffsetBuffer && j < input.length; j++) {
            accum += input[j];
            count++;
        }
        offsetBuffer = nextOffsetBuffer;
        const avg = count > 0 ? accum / count : 0;
        const s = Math.max(-1, Math.min(1, avg));
        result[i] = (s * 0x7fff) | 0;
    }

    return result;
}

function encodeWavPcm16Mono(samples: Int16Array, sampleRate: number): ArrayBuffer {
    const bytesPerSample = 2;
    const dataSize = samples.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // RIFF header
    writeAscii(view, 0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeAscii(view, 8, "WAVE");

    // fmt chunk
    writeAscii(view, 12, "fmt ");
    view.setUint32(16, 16, true); // PCM
    view.setUint16(20, 1, true); // format = PCM
    view.setUint16(22, 1, true); // channels = 1
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
    view.setUint16(32, bytesPerSample, true); // block align
    view.setUint16(34, 16, true); // bits per sample

    // data chunk
    writeAscii(view, 36, "data");
    view.setUint32(40, dataSize, true);

    // PCM data
    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
        view.setInt16(offset, samples[i], true);
        offset += 2;
    }

    return buffer;
}

export class WavRecorder {
    private opts: Required<WavRecorderOptions>;
    private stream: MediaStream | null = null;
    private audioContext: AudioContext | null = null;
    private source: MediaStreamAudioSourceNode | null = null;
    private processor: ScriptProcessorNode | null = null;
    private gain: GainNode | null = null;

    private chunks: Int16Array[] = [];
    private recording = false;
    private lastLevel = 0;
    private inputSampleRate = 48000;

    constructor(options: WavRecorderOptions = {}) {
        this.opts = {
            targetSampleRate: options.targetSampleRate ?? 16000,
            channelCount: 1,
            echoCancellation: options.echoCancellation ?? true,
            noiseSuppression: options.noiseSuppression ?? true,
        };
    }

    isRecording(): boolean {
        return this.recording;
    }

    getAudioLevel(): number {
        return this.lastLevel;
    }

    async start(): Promise<void> {
        if (this.recording) return;

        this.stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                channelCount: this.opts.channelCount,
                echoCancellation: this.opts.echoCancellation,
                noiseSuppression: this.opts.noiseSuppression,
            },
        });

        this.audioContext = new AudioContext();
        this.inputSampleRate = this.audioContext.sampleRate;
        try {
            if (this.audioContext.state === "suspended") {
                await this.audioContext.resume();
            }
        } catch {
            // ignore resume failures; processing may still work depending on platform policy
        }

        this.source = this.audioContext.createMediaStreamSource(this.stream);
        // ScriptProcessor is deprecated but still available in Electron/Chromium and keeps bundling simple.
        this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
        this.gain = this.audioContext.createGain();
        this.gain.gain.value = 0;

        this.chunks = [];
        this.lastLevel = 0;

        this.processor.onaudioprocess = (e) => {
            const input = e.inputBuffer.getChannelData(0);
            this.lastLevel = rmsLevel(input);

            const pcm16 = downsampleToInt16(input, this.inputSampleRate, this.opts.targetSampleRate);
            this.chunks.push(pcm16);
        };

        this.source.connect(this.processor);
        this.processor.connect(this.gain);
        this.gain.connect(this.audioContext.destination);

        this.recording = true;
    }

    async stop(): Promise<ArrayBuffer> {
        if (!this.recording) {
            return encodeWavPcm16Mono(new Int16Array(0), this.opts.targetSampleRate);
        }

        this.recording = false;

        try {
            this.processor?.disconnect();
            this.source?.disconnect();
            this.gain?.disconnect();
        } catch {
            // ignore disconnect errors
        }

        if (this.stream) {
            this.stream.getTracks().forEach((t) => t.stop());
        }

        const ctx = this.audioContext;
        this.audioContext = null;
        this.processor = null;
        this.source = null;
        this.gain = null;
        this.stream = null;

        if (ctx) {
            try {
                await ctx.close();
            } catch {
                // ignore close errors
            }
        }

        // Merge chunks into one Int16Array
        let total = 0;
        for (const c of this.chunks) total += c.length;
        const merged = new Int16Array(total);
        let offset = 0;
        for (const c of this.chunks) {
            merged.set(c, offset);
            offset += c.length;
        }

        this.chunks = [];
        this.lastLevel = 0;

        return encodeWavPcm16Mono(merged, this.opts.targetSampleRate);
    }

    cancel(): void {
        if (!this.recording) return;
        this.recording = false;

        try {
            this.processor?.disconnect();
            this.source?.disconnect();
            this.gain?.disconnect();
        } catch {
            // ignore
        }

        if (this.stream) {
            this.stream.getTracks().forEach((t) => t.stop());
        }

        const ctx = this.audioContext;
        this.audioContext = null;
        this.processor = null;
        this.source = null;
        this.gain = null;
        this.stream = null;
        this.chunks = [];
        this.lastLevel = 0;

        // Closing async is fine to fire-and-forget here.
        if (ctx) {
            ctx.close().catch(() => void 0);
        }
    }
}
