/**
 * Audio Recorder for Electron renderer
 *
 * Important:
 * - We must produce WAV (16kHz/mono/16-bit PCM) to match backend expectations and the macOS app.
 * - MediaRecorder in Chromium typically outputs Opus/WebM, so we record raw PCM via WebAudio and encode WAV.
 */

import { WavRecorder } from "./wav-recorder";

export class AudioRecorder {
    private wav = new WavRecorder({ targetSampleRate: 16000, channelCount: 1 });

    async startRecording(): Promise<void> {
        await this.wav.start();
        console.log("Audio recording started (WAV/PCM16 mono @16k)");
    }

    async stopRecording(): Promise<ArrayBuffer> {
        const arrayBuffer = await this.wav.stop();
        console.log("Audio recording stopped, size:", arrayBuffer.byteLength);
        return arrayBuffer;
    }

    cancelRecording(): void {
        this.wav.cancel();
        console.log("Audio recording cancelled");
    }

    isRecording(): boolean {
        return this.wav.isRecording();
    }

    getAudioLevel(): number {
        return this.wav.getAudioLevel();
    }
}

// Global instance
let globalRecorder: AudioRecorder | null = null;

export function getGlobalRecorder(): AudioRecorder {
    if (!globalRecorder) {
        globalRecorder = new AudioRecorder();
    }
    return globalRecorder;
}
