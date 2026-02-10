"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

interface RecordingOverlayProps {
    isRecording?: boolean;
    isTranscribing?: boolean;
    isCancelled?: boolean;
    duration?: number;
    audioLevel?: number;
}

function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function SoundWaveBar({ level, index, isRecording }: { level: number; index: number; isRecording: boolean }) {
    const [height, setHeight] = useState(4);

    useEffect(() => {
        if (isRecording) {
            const baseHeight = level * 25;
            const variation = (Math.random() - 0.5) * 6;
            const indexOffset = Math.abs(index - 2) * 2;
            setHeight(Math.max(4, Math.min(25, baseHeight + variation - indexOffset)));
        } else {
            setHeight(4);
        }
    }, [level, index, isRecording]);

    return (
        <div
            className="w-1 bg-white rounded-sm transition-all duration-100 ease-in-out"
            style={{ height: `${height}px` }}
        />
    );
}

function ThinkingDots() {
    return (
        <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-white/90">thinking</span>
            <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                    <div
                        key={i}
                        className={`w-1.5 h-1.5 bg-white rounded-full animate-pulse thinking-dot thinking-dot-delay-${i}`}
                    />
                ))}
            </div>
        </div>
    );
}

export function RecordingOverlay({
    isRecording = true,
    isTranscribing = false,
    isCancelled = false,
    duration = 0,
    audioLevel = 0.5,
}: RecordingOverlayProps) {
    const [isHovering, setIsHovering] = useState(false);

    const handleClick = useCallback(() => {
        if (isRecording) {
            // Click to cancel recording
            window.electron?.recording.cancel();
        }
    }, [isRecording]);

    // Enable dragging by making the window draggable
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        // Only allow dragging when not hovering (to allow click to cancel)
        if (!isHovering && e.button === 0) {
            e.preventDefault();
            // Electron will handle the drag automatically since movable: true
        }
    }, [isHovering]);

    return (
        <div
            className={cn(
                "inline-flex items-center gap-3 px-4 py-2.5 rounded-xl backdrop-blur-sm transition-colors min-w-[140px]",
                isHovering && isRecording
                    ? "bg-red-500/85 border border-red-500/60 cursor-pointer"
                    : "bg-black/85 border border-white/30 cursor-move"
            )}
            style={{ WebkitAppRegion: isHovering ? 'no-drag' : 'drag' } as React.CSSProperties}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
            onClick={handleClick}
            onMouseDown={handleMouseDown}
        >
            {isCancelled ? (
                <>
                    <svg
                        className="w-4 h-4 text-orange-500"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                    >
                        <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                            clipRule="evenodd"
                        />
                    </svg>
                    <span className="text-sm font-medium text-white/90">已取消</span>
                </>
            ) : isTranscribing ? (
                <ThinkingDots />
            ) : (
                <>
                    {/* Recording indicator */}
                    <div
                        className={cn(
                            "w-2.5 h-2.5 rounded-full bg-white transition-opacity",
                            isRecording ? "animate-pulse" : "opacity-30"
                        )}
                    />

                    {/* Sound wave */}
                    <div className="flex items-center gap-0.5 h-[30px]">
                        {[0, 1, 2, 3, 4].map((index) => (
                            <SoundWaveBar
                                key={index}
                                level={audioLevel}
                                index={index}
                                isRecording={isRecording}
                            />
                        ))}
                    </div>

                    {/* Duration or cancel hint */}
                    {isHovering ? (
                        <span className="text-xs font-medium text-white/90">点击取消</span>
                    ) : (
                        <span className="text-sm font-medium font-mono text-white">
                            {formatDuration(duration)}
                        </span>
                    )}
                </>
            )}
        </div>
    );
}
