"use client";

import { useEffect, useState } from "react";

interface RecordingControlsProps {
  isRecording: boolean;
  startTime: number | null;
  activeSpeaker: string | null;
  onStart: () => void;
  onStop: () => void;
}

export function RecordingControls({
  isRecording,
  startTime,
  activeSpeaker,
  onStart,
  onStop,
}: RecordingControlsProps) {
  const [elapsed, setElapsed] = useState("00:00");

  useEffect(() => {
    if (!isRecording || !startTime) {
      setElapsed("00:00");
      return;
    }

    const timer = setInterval(() => {
      const secs = Math.floor((Date.now() - startTime) / 1000);
      const m = Math.floor(secs / 60).toString().padStart(2, "0");
      const s = (secs % 60).toString().padStart(2, "0");
      setElapsed(`${m}:${s}`);
    }, 1000);

    return () => clearInterval(timer);
  }, [isRecording, startTime]);

  return (
    <div className="border-t px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        {isRecording && (
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        )}
        <span className="text-sm font-mono text-muted-foreground">{elapsed}</span>
        {activeSpeaker && isRecording && (
          <span className="text-xs text-muted-foreground">
            {activeSpeaker} 正在说话
          </span>
        )}
      </div>
      <div className="flex gap-2">
        {!isRecording ? (
          <button
            onClick={onStart}
            className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded-md transition"
          >
            开始录制
          </button>
        ) : (
          <button
            onClick={onStop}
            className="px-4 py-1.5 bg-muted hover:bg-muted/80 text-foreground text-sm rounded-md transition"
          >
            停止录制
          </button>
        )}
      </div>
    </div>
  );
}
