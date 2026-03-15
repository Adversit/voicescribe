"use client";

import { useState, useEffect } from "react";
import { RecordingOverlay } from "@/components/RecordingOverlay";

interface RecordingState {
    isRecording: boolean;
    isTranscribing?: boolean;
    cancelled?: boolean;
    startTime?: number;
    audioLevel?: number;
}

export default function OverlayPage() {
    const [isRecording, setIsRecording] = useState(true);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [isCancelled, setIsCancelled] = useState(false);
    const [duration, setDuration] = useState(0);
    const [audioLevel, setAudioLevel] = useState(0.5);
    const [startTime, setStartTime] = useState<number | null>(null);

    useEffect(() => {
        // Timer for recording duration based on start time
        let timer: NodeJS.Timeout | null = null;
        if (isRecording && !isTranscribing && !isCancelled && startTime) {
            timer = setInterval(() => {
                setDuration(Math.floor((Date.now() - startTime) / 1000));
            }, 100);
        }
        return () => {
            if (timer) clearInterval(timer);
        };
    }, [isRecording, isTranscribing, isCancelled, startTime]);

    // Audio level is pushed from the recorder via Electron IPC (real RMS), so no simulation is needed.

    useEffect(() => {
        // Listen for IPC events from Electron main process
        if (typeof window !== "undefined" && window.electron?.recording) {
            const unsubscribe = window.electron.recording.onStateChange((state: unknown) => {
                const s = state as RecordingState;

                if (s.cancelled) {
                    setIsCancelled(true);
                    setIsRecording(false);
                    setIsTranscribing(false);
                    setAudioLevel(0);
                } else if (s.isRecording) {
                    setIsRecording(true);
                    setIsTranscribing(false);
                    setIsCancelled(false);
                    // Only reset duration when startTime actually changes (new session),
                    // not on every audio level broadcast
                    if (s.startTime) {
                        setStartTime((prev) => {
                            if (prev !== s.startTime) {
                                setDuration(0);
                                return s.startTime!;
                            }
                            return prev;
                        });
                    }
                    setAudioLevel(typeof s.audioLevel === "number" ? s.audioLevel : 0.5);
                } else if (s.isTranscribing) {
                    setIsRecording(false);
                    setIsTranscribing(true);
                    setAudioLevel(typeof s.audioLevel === "number" ? s.audioLevel : 0);
                } else {
                    setIsRecording(false);
                    setIsTranscribing(false);
                    setAudioLevel(typeof s.audioLevel === "number" ? s.audioLevel : 0);
                }
            });

            return () => unsubscribe();
        }
    }, []);

    return (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-none bg-transparent">
            <div className="pointer-events-auto">
                <RecordingOverlay
                    isRecording={isRecording}
                    isTranscribing={isTranscribing}
                    isCancelled={isCancelled}
                    duration={duration}
                    audioLevel={audioLevel}
                />
            </div>
        </div>
    );
}
