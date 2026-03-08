"use client";

import { cn } from "@/lib/utils";
import type { MeetingUtterance } from "../../store/meeting-store";

interface SpeakerFilterProps {
  utterances: MeetingUtterance[];
  selectedSpeaker: string | null;
  onSelect: (speaker: string | null) => void;
}

export function SpeakerFilter({ utterances, selectedSpeaker, onSelect }: SpeakerFilterProps) {
  const speakers = Array.from(new Set(utterances.map((u) => u.speaker)));

  if (speakers.length <= 1) return null;

  return (
    <div className="flex gap-1.5 px-4 py-2 overflow-x-auto border-b">
      <button
        onClick={() => onSelect(null)}
        className={cn(
          "px-3 py-1 text-xs rounded-full transition-colors shrink-0",
          selectedSpeaker === null
            ? "bg-blue-500 text-white"
            : "bg-muted text-muted-foreground hover:text-foreground"
        )}
      >
        全部
      </button>
      {speakers.map((speaker) => (
        <button
          key={speaker}
          onClick={() => onSelect(speaker)}
          className={cn(
            "px-3 py-1 text-xs rounded-full transition-colors shrink-0",
            selectedSpeaker === speaker
              ? "bg-blue-500 text-white"
              : "bg-muted text-muted-foreground hover:text-foreground"
          )}
        >
          {speaker}
        </button>
      ))}
    </div>
  );
}
