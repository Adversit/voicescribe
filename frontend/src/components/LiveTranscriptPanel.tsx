"use client";

import { useRecordingStore } from "@/store/recording-store";
import { TranscriptPanel } from "./meeting/TranscriptPanel";
import { SummaryCard } from "./meeting/SummaryCard";
import { Radio } from "lucide-react";

/**
 * Live Transcript Panel
 * Shows real-time streaming transcription results.
 * Replaces the old MeetingRecorder component.
 */
export function LiveTranscriptPanel() {
  const isRecording = useRecordingStore((s) => s.isRecording);
  const utterances = useRecordingStore((s) => s.currentUtterances);
  const summary = useRecordingStore((s) => s.currentSummary);
  const activeSpeaker = useRecordingStore((s) => s.activeSpeaker);

  // Empty state when not streaming
  if (!isRecording && utterances.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-3">
        <Radio className="h-10 w-10 opacity-30" />
        <p className="text-sm">开启流式传输后，录制内容将在此实时显示</p>
        <p className="text-xs opacity-60">
          在「通用」设置中开启流式传输，然后按下快捷键开始录制
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <TranscriptPanel
        utterances={utterances}
        activeSpeaker={activeSpeaker}
      />
      <SummaryCard summary={summary} isRecording={isRecording} />
      {isRecording && (
        <div className="border-t px-4 py-2 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-xs text-muted-foreground">
            实时转录中{activeSpeaker ? ` · ${activeSpeaker} 正在说话` : ""}
          </span>
        </div>
      )}
    </div>
  );
}
