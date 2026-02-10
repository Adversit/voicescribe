"use client";

import { useEffect } from "react";
import { getGlobalRecorder } from "@/lib/audio-recorder";
import { useAppStore } from "@/store/app-store";

/**
 * Global Recording Manager
 * Listens to Electron IPC events and manages audio recording
 */
export function GlobalRecordingManager() {
    const { addTranscription } = useAppStore();

    useEffect(() => {
        console.log('[GlobalRecordingManager] Component mounted');
        console.log('[GlobalRecordingManager] window.electron:', window.electron);
        console.log('[GlobalRecordingManager] window.electron.on:', window.electron?.on);
        
        if (typeof window === "undefined" || !window.electron) {
            console.error('[GlobalRecordingManager] window.electron is not available');
            return;
        }

        const recorder = getGlobalRecorder();
        let levelTimer: ReturnType<typeof setInterval> | null = null;

        // Listen for start recording event
        const handleStartRecording = async () => {
            try {
                console.log('[GlobalRecordingManager] Starting recording...');
                await recorder.startRecording();

                // Push real audio level to main process for the overlay waveform.
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
                console.error('[GlobalRecordingManager] Failed to start recording:', error);
                // Notify main process of error
                window.electron?.recording?.cancel();
            }
        };

        // Listen for stop recording event
        const handleStopRecording = async () => {
            try {
                console.log('[GlobalRecordingManager] Stopping recording...');
                if (levelTimer) {
                    clearInterval(levelTimer);
                    levelTimer = null;
                }
                window.electron?.recording?.updateAudioLevel?.(0);
                const audioBuffer = await recorder.stopRecording();
                
                // Transcribe via backend (main process handles settings and backend call)
                console.log('[GlobalRecordingManager] Transcribing audio...');
                const result = await window.electron.recording.transcribeAudio(audioBuffer);
                
                if (!result.success) {
                    throw new Error(result.error || 'Transcription failed');
                }
                
                console.log('[GlobalRecordingManager] Transcription complete');
                
                // Note: Main process handles transcription result, output mode, and history
                // The recording-complete event is sent by main process after transcription
            } catch (error) {
                console.error('[GlobalRecordingManager] Failed to transcribe:', error);
                window.electron?.recording?.error(String(error));
            }
        };

        // Listen for cancel recording event
        const handleCancelRecording = () => {
            console.log('[GlobalRecordingManager] Cancelling recording...');
            if (levelTimer) {
                clearInterval(levelTimer);
                levelTimer = null;
            }
            window.electron?.recording?.updateAudioLevel?.(0);
            recorder.cancelRecording();
        };

        // Listen for transcription complete event from main process
        const handleTranscriptionComplete = async (data: { text: string; result?: { duration: number; segments: any[]; engine: string; model: string } }) => {
            console.log('[GlobalRecordingManager] ===== TRANSCRIPTION COMPLETE EVENT =====');
            console.log('[GlobalRecordingManager] Event data:', data);
            console.log('[GlobalRecordingManager] Text:', data.text.substring(0, 50));
            console.log('[GlobalRecordingManager] Result:', data.result);
            
            try {
                // Get settings to save with history
                const settings = await window.electron.settings.get();
                console.log('[GlobalRecordingManager] Settings:', settings);
                
                const transcription = {
                    duration: data.result?.duration || 0,
                    text: data.text,
                    segments: data.result?.segments || [],
                    engine: data.result?.engine || settings.engine,
                    model: data.result?.model || settings.model,
                    language: settings.language,
                };
                
                console.log('[GlobalRecordingManager] Adding transcription:', transcription);
                
                // Add to history
                addTranscription(transcription);
                
                console.log('[GlobalRecordingManager] Transcription added to store');
            } catch (error) {
                console.error('[GlobalRecordingManager] Error handling transcription complete:', error);
            }
        };

        // Register IPC listeners
        console.log('[GlobalRecordingManager] Registering IPC listeners...');
        window.electron?.on?.('start-audio-recording', handleStartRecording);
        window.electron?.on?.('stop-audio-recording', handleStopRecording);
        window.electron?.on?.('cancel-audio-recording', handleCancelRecording);
        
        // Use the correct API for transcription-complete event
        const unsubscribeTranscription = window.electron?.transcription?.onComplete(handleTranscriptionComplete);
        console.log('[GlobalRecordingManager] IPC listeners registered');

        // Cleanup
        return () => {
            console.log('[GlobalRecordingManager] Component unmounting, cleaning up...');
            // Unsubscribe from transcription-complete event
            if (unsubscribeTranscription) {
                unsubscribeTranscription();
            }
            if (levelTimer) {
                clearInterval(levelTimer);
                levelTimer = null;
            }
            // Note: Other Electron IPC cleanup is handled by the preload script
            if (recorder.isRecording()) {
                recorder.cancelRecording();
            }
        };
    }, [addTranscription]);

    return null; // This component doesn't render anything
}
