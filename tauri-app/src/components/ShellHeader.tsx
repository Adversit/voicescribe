import { useEffect, useMemo, useState } from "react";
import { Copy, Mic, Square, Sparkles } from "lucide-react";
import { beginRecordingSession, finishRecordingSession } from "../lib/recordingFlow";
import { copyText } from "../lib/clipboard";
import { useAppStore } from "../stores/appStore";

function formatDuration(milliseconds: number | null) {
  if (!milliseconds) {
    return "00:00";
  }

  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function ShellHeader() {
  const backendConnected = useAppStore((state) => state.backendConnected);
  const isRecording = useAppStore((state) => state.isRecording);
  const isTranscribing = useAppStore((state) => state.isTranscribing);
  const recordingStartedAt = useAppStore((state) => state.recordingStartedAt);
  const currentTranscription = useAppStore((state) => state.currentTranscription);
  const transcriptionCount = useAppStore((state) => state.transcriptions.length);
  const setToast = useAppStore((state) => state.setToast);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!isRecording) {
      return;
    }

    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [isRecording]);

  const elapsed = useMemo(() => {
    if (!isRecording || !recordingStartedAt) {
      return null;
    }
    return now - recordingStartedAt;
  }, [isRecording, now, recordingStartedAt]);

  const statusLabel = isRecording
    ? `录音中 ${formatDuration(elapsed)}`
    : isTranscribing
      ? "转录中"
      : "待命";

  return (
    <section className="rounded-[26px] border border-line bg-white/82 px-5 py-5 shadow-panel backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-white">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-ink">VoiceScribe</h1>
              <p className="text-sm text-ink/60">设置、录音状态与最近结果统一在一个窗口里管理。</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 text-sm">
            <div className="rounded-full bg-canvas px-4 py-2 text-ink/75">
              后端：{backendConnected ? "已连接" : "未连接"}
            </div>
            <div className="rounded-full bg-canvas px-4 py-2 text-ink/75">
              当前状态：{statusLabel}
            </div>
            <div className="rounded-full bg-canvas px-4 py-2 text-ink/75">
              历史转录：{transcriptionCount} 条
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() =>
              void (isRecording ? finishRecordingSession() : beginRecordingSession()).catch(
                (error) => setToast(error instanceof Error ? error.message : "录音操作失败"),
              )
            }
            className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm text-white"
          >
            {isRecording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            {isRecording ? "停止并转录" : "开始录音"}
          </button>
          <button
            type="button"
            disabled={!currentTranscription?.text}
            onClick={() =>
              void copyText(currentTranscription?.text ?? "")
                .then(() => setToast("最近结果已复制到剪贴板"))
                .catch((error) =>
                  setToast(error instanceof Error ? error.message : "复制失败"),
                )
            }
            className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm text-ink/75 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Copy className="h-4 w-4" />
            复制最近结果
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-[22px] border border-line/80 bg-panel/85 px-4 py-4">
        <div className="text-xs uppercase tracking-[0.18em] text-ink/45">最近转录</div>
        <p className="mt-2 text-sm leading-6 text-ink/75">
          {currentTranscription?.text
            ? `${currentTranscription.text.slice(0, 160)}${currentTranscription.text.length > 160 ? "..." : ""}`
            : "还没有转录结果。录音完成后，最近一条结果会显示在这里，便于快速复制和复查。"}
        </p>
      </div>
    </section>
  );
}
