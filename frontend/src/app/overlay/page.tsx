"use client";

import { useState, useEffect, useRef } from "react";
import { RecordingOverlay } from "@/components/RecordingOverlay";

interface RecordingState {
    isRecording: boolean;
    isTranscribing?: boolean;
    cancelled?: boolean;
    startTime?: number;
    audioLevel?: number;
}

export default function OverlayPage() {
    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [isCancelled, setIsCancelled] = useState(false);
    const [duration, setDuration] = useState(0);
    const [audioLevel, setAudioLevel] = useState(0);
    const [startTime, setStartTime] = useState<number | null>(null);
    const lastStartTimeRef = useRef<number | null>(null);
    const targetLevelRef = useRef(0);

    useEffect(() => {
        // Timer for recording duration based on start time.
        // Update at 250ms to keep UI stable while still responsive.
        let timer: NodeJS.Timeout | null = null;
        if (isRecording && !isTranscribing && !isCancelled && startTime) {
            timer = setInterval(() => {
                const next = Math.floor((Date.now() - startTime) / 1000);
                setDuration((prev) => (prev === next ? prev : next));
            }, 250);
        }
        return () => {
            if (timer) clearInterval(timer);
        };
    }, [isRecording, isTranscribing, isCancelled, startTime]);

    // Smooth target level from IPC to reduce visible jitter in bars.
    useEffect(() => {
        const timer = setInterval(() => {
            setAudioLevel((prev) => {
                const target = targetLevelRef.current;
                const gated = target < 0.015 ? 0 : target;
                const alpha = gated > prev ? 0.4 : 0.18; // faster attack, slower release
                const next = prev + (gated - prev) * alpha;
                return Math.abs(next - prev) < 0.002 ? prev : next;
            });
        }, 50);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        // Listen for IPC events from Electron main process
        if (typeof window !== "undefined" && window.electron?.recording) {
            const unsubscribe = window.electron.recording.onStateChange((state: unknown) => {
                const s = state as RecordingState;
                const nextLevel =
                    typeof s.audioLevel === "number" ? Math.max(0, Math.min(1, s.audioLevel)) : 0;

                if (s.cancelled) {
                    setIsCancelled(true);
                    setIsRecording(false);
                    setIsTranscribing(false);
                    targetLevelRef.current = 0;
                    setStartTime(null);
                    lastStartTimeRef.current = null;
                } else if (s.isRecording) {
                    setIsRecording(true);
                    setIsTranscribing(false);
                    setIsCancelled(false);
                    if (typeof s.startTime === "number" && s.startTime !== lastStartTimeRef.current) {
                        lastStartTimeRef.current = s.startTime;
                        setStartTime(s.startTime);
                        setDuration(0);
                    }
                    targetLevelRef.current = nextLevel;
                } else if (s.isTranscribing) {
                    setIsRecording(false);
                    setIsTranscribing(true);
                    setIsCancelled(false);
                    targetLevelRef.current = 0;
                } else {
                    setIsRecording(false);
                    setIsTranscribing(false);
                    setIsCancelled(false);
                    targetLevelRef.current = 0;
                    setStartTime(null);
                    lastStartTimeRef.current = null;
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
