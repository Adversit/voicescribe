"use client";

import { useEffect } from "react";
import { getGlobalRecorder } from "@/lib/audio-recorder";
import { useRecordingStore } from "@/store/recording-store";
import { StreamWebSocket, type SessionEndData } from "@/lib/stream-websocket";
import { exportRecordingAsText, type MeetingOutputFormat } from "@/lib/export-recording";

/**
 * Global Recording Manager
 * Unified recording entry point: hotkey triggers recording,
 * settings.enableStreaming decides the pipeline.
 *
 * - Streaming OFF → WavRecorder → POST /transcribe → history
 * - Streaming ON  → StreamWebSocket → WS /stream → live transcript + history
 */
export function GlobalRecordingManager() {
    const store = useRecordingStore();

    useEffect(() => {
        console.log("[GlobalRecordingManager] Component mounted");

        if (typeof window === "undefined" || !window.electron) {
            console.error("[GlobalRecordingManager] window.electron is not available");
            return;
        }

        const recorder = getGlobalRecorder();
        let levelTimer: ReturnType<typeof setInterval> | null = null;
        let streamWs: StreamWebSocket | null = null;

        const handleStartRecording = async () => {
            try {
                console.log("[GlobalRecordingManager] Starting recording...");
                const settings = await window.electron.settings.get();

                if (settings.enableStreaming) {
                    // --- Streaming path: use StreamWebSocket → WS /stream ---
                    const ws = new StreamWebSocket("ws://127.0.0.1:8765", {
                        onStarted: (info) => {
                            useRecordingStore.getState().startSession(info.sessionId, settings.engine);
                            if (info.speakerBackend) {
                                console.log(`[GlobalRecordingManager] Speaker model: ${info.speakerBackend}, registered: ${info.registeredSpeakers}`);
                            }
                        },
                        onUtterance: (utterance) => {
                            useRecordingStore.getState().addUtterance(utterance);
                        },
                        onUtteranceRefined: (id, text) => {
                            useRecordingStore.getState().updateUtterance(id, text);
                        },
                        onSpeakerActive: (speakers) => {
                            useRecordingStore.getState().setActiveSpeakers(speakers);
                        },
                        onSummary: (summary) => {
                            useRecordingStore.getState().setSummary(summary);
                        },
                        onSessionEnd: () => {
                            useRecordingStore.getState().endSession();
                        },
                        onError: (msg) => {
                            console.error("[GlobalRecordingManager] Stream error:", msg);
                        },
                    });

                    try {
                        await ws.connect({
                            engine: settings.engine,
                            model: settings.model || "firered-aed-l",
                            speakersEnabled: settings.enableDiarization ?? false,
                            hotwords: (settings.vocabulary || []).join(", "),
                            enableAiRefine: settings.enableAiRefine ?? false,
                            enableAiSummary: settings.enableAiSummary ?? false,
                            summaryInterval: settings.summaryInterval ?? 120,
                            llmProvider: settings.llmProvider || "claude_cli",
                            llmModel: settings.llmModel || "haiku",
                        });
                        streamWs = ws;
                        recorder.setOnPcmChunk((chunk) => ws.sendAudio(chunk));
                        console.log("[GlobalRecordingManager] Stream connected");
                    } catch (e) {
                        console.warn("[GlobalRecordingManager] Stream connect failed, fallback to file upload:", e);
                        streamWs = null;
                        recorder.setOnPcmChunk(undefined);
                    }
                } else {
                    // --- Non-streaming path ---
                    streamWs = null;
                    recorder.setOnPcmChunk(undefined);
                }

                await recorder.startRecording();

                // Push audio level to main process for overlay waveform
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
                console.log("[GlobalRecordingManager] Stopping recording...");
                if (levelTimer) {
                    clearInterval(levelTimer);
                    levelTimer = null;
                }
                window.electron?.recording?.updateAudioLevel?.(0);
                recorder.setOnPcmChunk(undefined);
                const audioBuffer = await recorder.stopRecording();

                if (streamWs) {
                    try {
                        console.log("[GlobalRecordingManager] Finishing stream...");
                        const endData: SessionEndData = await streamWs.finish(10000);
                        const settings = await window.electron.settings.get();
                        // Session end callback already saved to history via endSession()
                        // Also send result to main process for clipboard/input
                        const state = useRecordingStore.getState();
                        const latestRecord = state.history[0];
                        const text = latestRecord
                            ? exportRecordingAsText(
                                  latestRecord,
                                  (settings.meetingOutputFormat || "full") as MeetingOutputFormat
                              )
                            : "";
                        window.electron?.recording?.completeWithResult?.({
                            text,
                            result: {
                                duration: endData.duration,
                                segments: [],
                                engine: state.history[0]?.engine || "",
                                model: state.history[0]?.model || "",
                            },
                        });
                        console.log("[GlobalRecordingManager] Stream transcription complete");
                        return;
                    } catch (e) {
                        console.warn("[GlobalRecordingManager] Stream finish failed, fallback:", e);
                        // endSession() as fallback to save whatever we have
                        useRecordingStore.getState().endSession();
                    } finally {
                        streamWs = null;
                    }
                }

                // Fallback: non-stream upload transcription
                console.log("[GlobalRecordingManager] Transcribing audio (upload)...");
                const result = await window.electron.recording.transcribeAudio(audioBuffer);
                if (!result.success) throw new Error(result.error || "Transcription failed");
                console.log("[GlobalRecordingManager] Transcription complete (upload)");
            } catch (error) {
                console.error("[GlobalRecordingManager] Failed to transcribe:", error);
                window.electron?.recording?.error(String(error));
            }
        };

        const handleCancelRecording = () => {
            console.log("[GlobalRecordingManager] Cancelling recording...");
            if (levelTimer) {
                clearInterval(levelTimer);
                levelTimer = null;
            }
            window.electron?.recording?.updateAudioLevel?.(0);
            recorder.setOnPcmChunk(undefined);
            streamWs?.abort();
            streamWs = null;
            recorder.cancelRecording();
            // Reset session state if streaming was active
            const state = useRecordingStore.getState();
            if (state.isRecording) {
                set_fields_reset();
            }
        };

        function set_fields_reset() {
            useRecordingStore.setState({
                isRecording: false,
                sessionId: null,
                currentEngine: null,
                currentUtterances: [],
                currentSummary: null,
                activeSpeaker: null,
                activeSpeakers: [],
                recordingStartTime: null,
            });
        }

        // Listen for transcription complete event from main process (non-streaming)
        const handleTranscriptionComplete = async (data: {
            text: string;
            result?: { duration: number; segments: { start: number; end: number; text: string; speaker?: string }[]; engine: string; model: string };
        }) => {
            console.log("[GlobalRecordingManager] Transcription complete event");
            try {
                const settings = await window.electron.settings.get();
                useRecordingStore.getState().addToHistory({
                    duration: data.result?.duration || 0,
                    text: data.text,
                    segments: data.result?.segments || [],
                    engine: data.result?.engine || settings.engine,
                    model: data.result?.model || settings.model,
                    language: settings.language,
                    isStreaming: false,
                });
                console.log("[GlobalRecordingManager] Added to history");
            } catch (error) {
                console.error("[GlobalRecordingManager] Error handling transcription:", error);
            }
        };

        // Register IPC listeners
        console.log("[GlobalRecordingManager] Registering IPC listeners...");
        window.electron?.on?.("start-audio-recording", handleStartRecording);
        window.electron?.on?.("stop-audio-recording", handleStopRecording);
        window.electron?.on?.("cancel-audio-recording", handleCancelRecording);
        const unsubscribeTranscription = window.electron?.transcription?.onComplete(handleTranscriptionComplete);

        return () => {
            console.log("[GlobalRecordingManager] Cleanup");
            if (unsubscribeTranscription) unsubscribeTranscription();
            if (levelTimer) {
                clearInterval(levelTimer);
                levelTimer = null;
            }
            if (recorder.isRecording()) {
                recorder.setOnPcmChunk(undefined);
                streamWs?.abort();
                recorder.cancelRecording();
            }
        };
    }, []);

    return null;
}
