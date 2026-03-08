"use client";

import { useEffect, useRef } from "react";
import type { MeetingUtterance } from "../../store/meeting-store";

const SPEAKER_COLORS = [
  "text-blue-400",
  "text-green-400",
  "text-yellow-400",
  "text-purple-400",
  "text-pink-400",
  "text-cyan-400",
  "text-orange-400",
  "text-red-400",
];

interface TranscriptPanelProps {
  utterances: MeetingUtterance[];
  activeSpeaker: string | null;
}

export function TranscriptPanel({ utterances, activeSpeaker }: TranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const speakerColorMap = useRef(new Map<string, string>());

  function getSpeakerColor(speaker: string): string {
    if (!speakerColorMap.current.has(speaker)) {
      const idx = speakerColorMap.current.size % SPEAKER_COLORS.length;
      speakerColorMap.current.set(speaker, SPEAKER_COLORS[idx]);
    }
    return speakerColorMap.current.get(speaker)!;
  }

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [utterances]);

  function handleScroll() {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 50;
  }

  if (utterances.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        等待录音开始...
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto p-4 space-y-3"
    >
      {utterances.map((u) => (
        <div key={u.id} className="group">
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className={`font-medium text-sm ${getSpeakerColor(u.speaker)}`}>
              {u.speaker}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatTime(u.start)}
            </span>
          </div>
          <p className="text-sm text-foreground pl-0.5">{u.text}</p>
        </div>
      ))}

      {!autoScrollRef.current && (
        <button
          onClick={() => {
            autoScrollRef.current = true;
            scrollRef.current?.scrollTo({
              top: scrollRef.current.scrollHeight,
              behavior: "smooth",
            });
          }}
          className="fixed bottom-24 right-8 bg-muted text-foreground text-xs px-3 py-1 rounded-full shadow"
        >
          回到底部
        </button>
      )}
    </div>
  );
}
