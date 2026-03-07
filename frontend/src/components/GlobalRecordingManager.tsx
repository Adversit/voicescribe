"use client";

import { useEffect } from "react";
import { getGlobalRecorder } from "@/lib/audio-recorder";
import { useAppStore } from "@/store/app-store";
import { StreamTranscriber } from "@/lib/stream-transcriber";

function findSuffixPrefixOverlap(previous: string, current: string, maxWindow = 160): number {
    const max = Math.min(previous.length, current.length, maxWindow);
    for (let len = max; len > 0; len -= 1) {
        if (previous.slice(-len) === current.slice(0, len)) {
            return len;
        }
    }
    return 0;
}

/**
 * Global Recording Manager
 * Listens to Electron IPC events and manages audio recording
 */
export function GlobalRecordingManager() {
    const { addTranscription, setAskAnswer, setOperationNotice } = useAppStore();

    useEffect(() => {
        if (typeof window === "undefined" || !window.electron) {
            console.error("[GlobalRecordingManager] window.electron is not available");
            return;
        }

        const recorder = getGlobalRecorder();
        let levelTimer: ReturnType<typeof setInterval> | null = null;
        let stream: StreamTranscriber | null = null;
        let lastPartialText = "";

        const handleStartRecording = async () => {
            try {
                lastPartialText = "";
                const settings = await window.electron.settings.get();
                if (settings.enableStreaming) {
                    stream = new StreamTranscriber((partial) => {
                        const current = String(partial || "").trim();
                        if (!current) return;

                        const overlap = findSuffixPrefixOverlap(lastPartialText, current);
                        const delta = overlap > 0 ? current.slice(overlap) : current;
                        lastPartialText = current;

                        if (!delta.trim()) return;
                        console.log("[Stream] partial delta:", delta.slice(0, 40));
                        window.electron?.recording?.partial(delta);
                    });
                    try {
                        await stream.start({
                            engine: settings.engine,
                            model: settings.model,
                            language: settings.language,
                            hotwords: (settings.vocabulary || []).join(","),
                            enableAiRefine: settings.enableAiRefine,
                            enableDiarization: settings.enableDiarization,
                        });
                        recorder.setOnPcmChunk((chunk) => stream?.sendChunk(chunk));
                    } catch (e) {
                        console.warn("[Stream] start failed, fallback to file upload:", e);
                        stream = null;
                        lastPartialText = "";
                        recorder.setOnPcmChunk(undefined);
                    }
                } else {
                    stream = null;
                    lastPartialText = "";
                    recorder.setOnPcmChunk(undefined);
                }

                await recorder.startRecording();
                if (levelTimer) clearInterval(levelTimer);
                levelTimer = setInterval(() => {
                    try {
                        const level = recorder.getAudioLevel();
                        window.electron?.recording?.updateAudioLevel?.(level);
                    } catch {
                        // ignore
                    }
                }, 100);
            } catch (error) {
                console.error("[GlobalRecordingManager] Failed to start recording:", error);
                window.electron?.recording?.cancel();
            }
        };

        const handleStopRecording = async () => {
            try {
                if (levelTimer) {
                    clearInterval(levelTimer);
                    levelTimer = null;
                }
                window.electron?.recording?.updateAudioLevel?.(0);
                recorder.setOnPcmChunk(undefined);
                const audioBuffer = await recorder.stopRecording();

                if (stream) {
                    try {
                        const finalResult = await stream.finish(600000);
                        window.electron?.recording?.completeWithResult?.({
                            text: finalResult.text,
                            result: finalResult,
                        });
                        return;
                    } catch (e) {
                        console.warn("[Stream] finish failed, fallback to file upload:", e);
                    } finally {
                        stream = null;
                        lastPartialText = "";
                    }
                }

                const result = await window.electron.recording.transcribeAudio(audioBuffer);
                if (!result.success) throw new Error(result.error || "Transcription failed");
            } catch (error) {
                console.error("[GlobalRecordingManager] Failed to transcribe:", error);
                window.electron?.recording?.error(String(error));
            }
        };

        const handleCancelRecording = () => {
            if (levelTimer) {
                clearInterval(levelTimer);
                levelTimer = null;
            }
            window.electron?.recording?.updateAudioLevel?.(0);
            recorder.setOnPcmChunk(undefined);
            stream?.abort();
            stream = null;
            lastPartialText = "";
            recorder.cancelRecording();
        };

        const handleTranscriptionComplete = async (data: {
            text: string;
            result?: { duration: number; segments: any[]; engine: string; model: string };
        }) => {
            try {
                const settings = await window.electron!.settings.get();
                addTranscription({
                    duration: data.result?.duration || 0,
                    text: data.text,
                    segments: data.result?.segments || [],
                    engine: data.result?.engine || settings.engine,
                    model: data.result?.model || settings.model,
                    language: settings.language,
                });
            } catch (error) {
                console.error("[GlobalRecordingManager] Error handling transcription complete:", error);
            }
        };

        const handleAskAnswer = (payload: {
            question: string;
            answer: string;
            contextPreview?: string;
            timestamp: string;
        }) => {
            setAskAnswer({
                question: payload.question || "",
                answer: payload.answer || "",
                contextPreview: payload.contextPreview || "",
                timestamp: payload.timestamp || new Date().toISOString(),
            });
        };

        const handleOperationNotice = (payload: {
            type: "info" | "success" | "error";
            message: string;
            detail?: string;
            timestamp: string;
        }) => {
            setOperationNotice({
                type: payload.type || "info",
                message: payload.message || "",
                detail: payload.detail,
                timestamp: payload.timestamp || new Date().toISOString(),
            });
        };

        window.electron?.on?.("start-audio-recording", handleStartRecording);
        window.electron?.on?.("stop-audio-recording", handleStopRecording);
        window.electron?.on?.("cancel-audio-recording", handleCancelRecording);
        const unsubscribeAskAnswer = window.electron?.on?.("ask-answer", handleAskAnswer);
        const unsubscribeOperationNotice = window.electron?.on?.("operation-notice", handleOperationNotice);
        const unsubscribeTranscription = window.electron?.transcription?.onComplete(handleTranscriptionComplete);

        return () => {
            if (unsubscribeTranscription) unsubscribeTranscription();
            if (unsubscribeAskAnswer) unsubscribeAskAnswer();
            if (unsubscribeOperationNotice) unsubscribeOperationNotice();
            if (levelTimer) {
                clearInterval(levelTimer);
                levelTimer = null;
            }
            if (recorder.isRecording()) {
                recorder.setOnPcmChunk(undefined);
                stream?.abort();
                lastPartialText = "";
                recorder.cancelRecording();
            }
        };
    }, [addTranscription, setAskAnswer, setOperationNotice]);

    return null;
}
