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
    <section className="rounded-[22px] border border-[#e4dbc9] bg-[#f8f3ea] px-4 py-4">
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent text-white shadow-[0_10px_24px_rgba(171,91,48,0.24)]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-[22px] font-semibold text-ink">VoiceScribe</h1>
              <p className="text-sm text-ink/60">录音、最近结果和设置集中在一个原生风格窗口里。</p>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-2xl border border-[#e4dbc9] bg-white px-3 py-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-ink/40">Backend</div>
              <div className="mt-1 text-sm font-medium text-ink">
                {backendConnected ? "已连接" : "未连接"}
              </div>
            </div>
            <div className="rounded-2xl border border-[#e4dbc9] bg-white px-3 py-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-ink/40">Status</div>
              <div className="mt-1 text-sm font-medium text-ink">{statusLabel}</div>
            </div>
            <div className="rounded-2xl border border-[#e4dbc9] bg-white px-3 py-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-ink/40">History</div>
              <div className="mt-1 text-sm font-medium text-ink">{transcriptionCount} 条</div>
            </div>
          </div>
        </div>

        <div className="rounded-[20px] border border-[#e4dbc9] bg-white px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-ink">最近转录</div>
              <div className="mt-1 text-xs text-ink/50">这里对应原版菜单栏里的最近结果与快捷操作。</div>
            </div>
            <div className="flex flex-wrap gap-2">
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
                {isRecording ? "停止" : "开始录音"}
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
                className="inline-flex items-center gap-2 rounded-full border border-[#ddd2c0] px-4 py-2 text-sm text-ink/75 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Copy className="h-4 w-4" />
                复制
              </button>
            </div>
          </div>

          <p className="mt-3 rounded-2xl bg-[#f8f3ea] px-3 py-3 text-sm leading-6 text-ink/72">
            {currentTranscription?.text
              ? `${currentTranscription.text.slice(0, 160)}${currentTranscription.text.length > 160 ? "..." : ""}`
              : "还没有转录结果。录音完成后，最近一条结果会显示在这里，便于快速复制和复查。"}
          </p>
        </div>
      </div>
    </section>
  );
}
