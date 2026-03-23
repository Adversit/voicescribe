"use client";

import { useEffect } from "react";
import { getGlobalRecorder } from "@/lib/audio-recorder";
import { StreamWebSocket, type SessionEndData } from "@/lib/stream-websocket";
import { exportRecordingAsText, type MeetingOutputFormat } from "@/lib/export-recording";
import { useRecordingStore } from "@/store/recording-store";

export function GlobalRecordingManager() {
    useEffect(() => {
        console.log("[GlobalRecordingManager] Component mounted");

        if (typeof window === "undefined" || !window.electron) {
            console.error("[GlobalRecordingManager] window.electron is not available");
            return;
        }

        const recorder = getGlobalRecorder();
        let levelTimer: ReturnType<typeof setInterval> | null = null;
        let streamWs: StreamWebSocket | null = null;

        const resetLiveSessionState = () => {
            useRecordingStore.setState({
                isRecording: false,
                sessionId: null,
                currentEngine: null,
                currentModel: null,
                currentUtterances: [],
                currentSummary: null,
                activeSpeaker: null,
                activeSpeakers: [],
                recordingStartTime: null,
            });
        };

        const stopLevelTimer = () => {
            if (levelTimer) {
                clearInterval(levelTimer);
                levelTimer = null;
            }
        };

        const handleStartRecording = async (payload?: { requestId?: string }) => {
            const requestId = payload?.requestId;

            try {
                console.log("[GlobalRecordingManager] Starting recording...");
                const settings = await window.electron.settings.get();
                const runtimeState = await window.electron.runtime.ensureSessionRuntimeReady();

                if (runtimeState.asr.status !== "ready") {
                    throw new Error(runtimeState.asr.error || "ASR model is not ready");
                }
                if (settings.enableDiarization && runtimeState.speakerMapping.status !== "ready") {
                    throw new Error(
                        runtimeState.speakerMapping.error || "Speaker mapping model is not ready"
                    );
                }
                if (settings.enableStreaming && runtimeState.streamClustering.status !== "ready") {
                    throw new Error(
                        runtimeState.streamClustering.error || "Streaming clustering backend is not ready"
                    );
                }

                if (settings.enableStreaming) {
                    const ws = new StreamWebSocket("ws://127.0.0.1:8765", {
                        onStarted: (info) => {
                            useRecordingStore.getState().startSession(
                                info.sessionId,
                                settings.engine,
                                settings.model || "firered-aed-l"
                            );
                            if (info.speakerBackend) {
                                console.log(
                                    `[GlobalRecordingManager] Speaker model: ${info.speakerBackend}, registered: ${info.registeredSpeakers}`
                                );
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
                            vadThreshold: settings.vadThreshold,
                            vadMinSpeechMs: settings.vadMinSpeechMs,
                            vadHangoverMs: settings.vadHangoverMs,
                            vadPreRollMs: settings.vadPreRollMs,
                            vadMaxSegmentS: settings.vadMaxSegmentS,
                            speakerMatchThreshold: settings.speakerMatchThreshold,
                            activeRegisteredFloorMin: settings.activeRegisteredFloorMin,
                            activeRegisteredFloorOffset: settings.activeRegisteredFloorOffset,
                            activeRegisteredKeepMargin: settings.activeRegisteredKeepMargin,
                            stableRegisteredFloorOffset: settings.stableRegisteredFloorOffset,
                            stableRegisteredKeepMargin: settings.stableRegisteredKeepMargin,
                            registeredSwitchFloorMin: settings.registeredSwitchFloorMin,
                            registeredSwitchFloorOffset: settings.registeredSwitchFloorOffset,
                            registeredSwitchMargin: settings.registeredSwitchMargin,
                            spanContinuityFloorMin: settings.spanContinuityFloorMin,
                            spanContinuityFloorOffset: settings.spanContinuityFloorOffset,
                            spanContinuityKeepMargin: settings.spanContinuityKeepMargin,
                            spanTopFallbackOffset: settings.spanTopFallbackOffset,
                            pyannoteWindowS: settings.pyannoteWindowS,
                            pyannoteHopS: settings.pyannoteHopS,
                            pyannoteChangeSimilarity: settings.pyannoteChangeSimilarity,
                            minMultiSpeakerSpanS: settings.minMultiSpeakerSpanS,
                            noiseFilterEnabled: settings.noiseFilterEnabled,
                            noiseMaxDurationS: settings.noiseMaxDurationS,
                            noiseRmsThreshold: settings.noiseRmsThreshold,
                            noisePeakThreshold: settings.noisePeakThreshold,
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
                    } catch (error) {
                        console.warn(
                            "[GlobalRecordingManager] Stream connect failed, fallback to file upload:",
                            error
                        );
                        streamWs = null;
                        recorder.setOnPcmChunk(undefined);
                    }
                } else {
                    streamWs = null;
                    recorder.setOnPcmChunk(undefined);
                }

                await recorder.startRecording();
                window.electron?.recording?.started?.({ requestId });

                stopLevelTimer();
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
                stopLevelTimer();
                window.electron?.recording?.updateAudioLevel?.(0);
                recorder.setOnPcmChunk(undefined);
                streamWs?.abort();
                streamWs = null;
                if (recorder.isRecording()) {
                    recorder.cancelRecording();
                }
                resetLiveSessionState();
                window.electron?.recording?.startFailed?.({
                    requestId,
                    error: String(error),
                });
            }
        };

        const handleStopRecording = async () => {
            try {
                console.log("[GlobalRecordingManager] Stopping recording...");
                stopLevelTimer();
                window.electron?.recording?.updateAudioLevel?.(0);
                recorder.setOnPcmChunk(undefined);

                if (!recorder.isRecording()) {
                    console.warn("[GlobalRecordingManager] Stop ignored because recorder is not active");
                    return;
                }

                const audioBuffer = await recorder.stopRecording();

                if (streamWs) {
                    try {
                        console.log("[GlobalRecordingManager] Finishing stream...");
                        const endData: SessionEndData = await streamWs.finish(10000);
                        const settings = await window.electron.settings.get();
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
                    } catch (error) {
                        console.warn("[GlobalRecordingManager] Stream finish failed, fallback:", error);
                        useRecordingStore.getState().endSession();
                    } finally {
                        streamWs = null;
                    }
                }

                console.log("[GlobalRecordingManager] Transcribing audio (upload)...");
                const result = await window.electron.recording.transcribeAudio(audioBuffer);
                if (!result.success) {
                    throw new Error(result.userMessage || result.error || "Transcription failed");
                }
                console.log("[GlobalRecordingManager] Transcription complete (upload)");
            } catch (error) {
                console.error("[GlobalRecordingManager] Failed to transcribe:", error);
                window.electron?.recording?.error(String(error));
            }
        };

        const handleCancelRecording = () => {
            console.log("[GlobalRecordingManager] Cancelling recording...");
            stopLevelTimer();
            window.electron?.recording?.updateAudioLevel?.(0);
            recorder.setOnPcmChunk(undefined);
            streamWs?.abort();
            streamWs = null;
            recorder.cancelRecording();

            const state = useRecordingStore.getState();
            if (state.isRecording) {
                resetLiveSessionState();
            }
        };

        const handleTranscriptionComplete = async (data: {
            text: string;
            result?: {
                duration: number;
                segments: { start: number; end: number; text: string; speaker?: string }[];
                engine: string;
                model: string;
            };
        }) => {
            console.log("[GlobalRecordingManager] Transcription complete event");
            try {
                const settings = await window.electron.settings.get();
                const historyBeforeRaw = window.localStorage.getItem("voicescribe-recordings");
                let historyBeforeCount = 0;
                let latestBeforeTimestamp: number | null = null;
                if (historyBeforeRaw) {
                    try {
                        const parsed = JSON.parse(historyBeforeRaw);
                        const history = Array.isArray(parsed?.state?.history) ? parsed.state.history : [];
                        historyBeforeCount = history.length;
                        latestBeforeTimestamp =
                            history.length > 0 ? Number(history[0]?.timestamp || 0) : null;
                    } catch (error) {
                        console.warn("[GlobalRecordingManager] Failed to parse history before add:", error);
                    }
                }
                console.log(
                    `[GlobalRecordingManager] History before add: count=${historyBeforeCount} latestTimestamp=${latestBeforeTimestamp ?? "none"}`
                );
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
                const historyAfterRaw = window.localStorage.getItem("voicescribe-recordings");
                let historyAfterCount = 0;
                let latestAfterTimestamp: number | null = null;
                if (historyAfterRaw) {
                    try {
                        const parsed = JSON.parse(historyAfterRaw);
                        const history = Array.isArray(parsed?.state?.history) ? parsed.state.history : [];
                        historyAfterCount = history.length;
                        latestAfterTimestamp =
                            history.length > 0 ? Number(history[0]?.timestamp || 0) : null;
                    } catch (error) {
                        console.warn("[GlobalRecordingManager] Failed to parse history after add:", error);
                    }
                }
                console.log(
                    `[GlobalRecordingManager] History after add: count=${historyAfterCount} latestTimestamp=${latestAfterTimestamp ?? "none"} segmentCount=${data.result?.segments?.length || 0}`
                );
            } catch (error) {
                console.error("[GlobalRecordingManager] Error handling transcription:", error);
            }
        };

        console.log("[GlobalRecordingManager] Registering IPC listeners...");
        window.electron?.on?.("start-audio-recording", handleStartRecording);
        window.electron?.on?.("stop-audio-recording", handleStopRecording);
        window.electron?.on?.("cancel-audio-recording", handleCancelRecording);
        const unsubscribeTranscription =
            window.electron?.transcription?.onComplete(handleTranscriptionComplete);

        return () => {
            console.log("[GlobalRecordingManager] Cleanup");
            if (unsubscribeTranscription) unsubscribeTranscription();
            stopLevelTimer();
            if (recorder.isRecording()) {
                recorder.setOnPcmChunk(undefined);
                streamWs?.abort();
                recorder.cancelRecording();
            }
        };
    }, []);

    return null;
}
