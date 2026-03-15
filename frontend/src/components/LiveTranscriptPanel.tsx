"use client";

import { Radio } from "lucide-react";
import { useRecordingStore } from "@/store/recording-store";
import { SummaryCard } from "./meeting/SummaryCard";
import { TranscriptPanel } from "./meeting/TranscriptPanel";

/**
 * Live Transcript Panel
 * Shows real-time streaming transcription results.
 */
export function LiveTranscriptPanel() {
  const isRecording = useRecordingStore((s) => s.isRecording);
  const utterances = useRecordingStore((s) => s.currentUtterances);
  const summary = useRecordingStore((s) => s.currentSummary);
  const activeSpeaker = useRecordingStore((s) => s.activeSpeaker);
  const activeSpeakers = useRecordingStore((s) => s.activeSpeakers);
  const activeSpeakerLabel =
    activeSpeakers.length > 0
      ? activeSpeakers.map((item) => item.speaker).join(" / ")
      : activeSpeaker;

  if (!isRecording && utterances.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center space-y-3 text-muted-foreground">
        <Radio className="h-10 w-10 opacity-30" />
        <p className="text-sm">开启流式传输后，录音内容会在这里实时显示</p>
        <p className="text-xs opacity-60">
          在“通用”设置中打开流式传输，然后按下快捷键开始录制
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <TranscriptPanel utterances={utterances} activeSpeaker={activeSpeakerLabel} />
      <SummaryCard summary={summary} isRecording={isRecording} />
      {isRecording && (
        <div className="flex items-center gap-2 border-t px-4 py-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
          <span className="text-xs text-muted-foreground">
            实时转录中
            {activeSpeakerLabel ? ` · ${activeSpeakerLabel} 正在说话` : ""}
          </span>
        </div>
      )}
    </div>
  );
}
