"use client";

import { useCallback, useRef } from "react";
import { useMeetingStore } from "../store/meeting-store";
import { MeetingWebSocket } from "../lib/meeting-websocket";
import { WavRecorder } from "../lib/wav-recorder";
import { TranscriptPanel } from "./meeting/TranscriptPanel";
import { SummaryCard } from "./meeting/SummaryCard";
import { RecordingControls } from "./meeting/RecordingControls";

export function MeetingRecorder() {
  const store = useMeetingStore();
  const wsRef = useRef<MeetingWebSocket | null>(null);
  const recorderRef = useRef<WavRecorder | null>(null);

  const handleStart = useCallback(async () => {
    try {
      // Get settings from electron
      const settings = await window.electron?.settings.get();

      const ws = new MeetingWebSocket("ws://127.0.0.1:8765", {
        onStarted: (sessionId) => {
          store.startSession(sessionId);
        },
        onUtterance: (utterance) => {
          store.addUtterance(utterance);
        },
        onUtteranceRefined: (id, text) => {
          store.updateUtterance(id, text);
        },
        onSpeakerActive: (speaker) => {
          store.setActiveSpeaker(speaker);
        },
        onSummary: (summary) => {
          store.setSummary(summary);
        },
        onSessionEnd: () => {
          store.endSession();
        },
        onError: (msg) => {
          console.error("[MeetingRecorder] Error:", msg);
        },
      });

      await ws.connect({
        engine: settings?.engine || "firered",
        model: settings?.model || "firered-aed-l",
        speakersEnabled: settings?.enableDiarization ?? true,
        hotwords: settings?.vocabulary?.join(", ") || "",
        enableAiRefine: settings?.enableAiRefine ?? true,
      });

      wsRef.current = ws;

      // Start audio capture
      const recorder = new WavRecorder({ targetSampleRate: 16000 });
      recorderRef.current = recorder;

      recorder.setOnPcmChunk((chunk: Int16Array) => {
        ws.sendAudio(chunk);
      });

      await recorder.start();
    } catch (err) {
      console.error("[MeetingRecorder] Failed to start:", err);
    }
  }, [store]);

  const handleStop = useCallback(async () => {
    try {
      // Stop audio capture
      if (recorderRef.current) {
        await recorderRef.current.stop();
        recorderRef.current = null;
      }

      // End meeting session
      if (wsRef.current) {
        await wsRef.current.finish();
        wsRef.current = null;
      }
    } catch (err) {
      console.error("[MeetingRecorder] Failed to stop:", err);
      store.endSession();
    }
  }, [store]);

  return (
    <div className="flex flex-col h-full">
      <TranscriptPanel
        utterances={store.currentUtterances}
        activeSpeaker={store.activeSpeaker}
      />
      <SummaryCard
        summary={store.currentSummary}
        isRecording={store.isRecording}
      />
      <RecordingControls
        isRecording={store.isRecording}
        startTime={store.recordingStartTime}
        activeSpeaker={store.activeSpeaker}
        onStart={handleStart}
        onStop={handleStop}
      />
    </div>
  );
}
