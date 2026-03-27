import { useEffect, useMemo, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import type { OverlayMode, OverlayStatePayload } from "../lib/overlayWindow";

function formatDuration(milliseconds: number | null) {
  if (!milliseconds) {
    return "00:00";
  }

  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function AudioBars({ level, active }: { level: number; active: boolean }) {
  const bars = [0.55, 0.85, 1, 0.8, 0.5];

  return (
    <div className="flex h-8 items-end gap-[3px]">
      {bars.map((factor, index) => {
        const height = active ? Math.max(6, Math.min(28, 8 + level * factor * 20)) : 6;
        return (
          <span
            key={index}
            className="w-1 rounded-full bg-white/95 transition-all duration-100"
            style={{ height }}
          />
        );
      })}
    </div>
  );
}

export function RecordingOverlay() {
  const [mode, setMode] = useState<OverlayMode>("idle");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let unlistenState: (() => void) | undefined;
    let unlistenAudio: (() => void) | undefined;

    const bind = async () => {
      unlistenState = await listen<OverlayStatePayload>("overlay-state", (event) => {
        const payload = event.payload;
        setMode(payload.mode);
        setStartedAt(payload.mode === "recording" ? (payload.startedAt ?? Date.now()) : null);
        if (payload.mode !== "recording") {
          setAudioLevel(0);
        }
      });

      unlistenAudio = await listen<number>("audio-level", (event) => {
        setAudioLevel(event.payload ?? 0);
      });
    };

    void bind();

    return () => {
      unlistenState?.();
      unlistenAudio?.();
    };
  }, []);

  useEffect(() => {
    if (mode !== "recording") {
      return;
    }

    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [mode]);

  const elapsed = useMemo(() => {
    if (mode !== "recording" || !startedAt) {
      return null;
    }
    return now - startedAt;
  }, [mode, now, startedAt]);

  const backgroundClass = mode === "cancelled"
    ? "bg-[#9a3f1d]/90"
    : mode === "recording"
      ? "bg-[#17100dcc]"
      : "bg-[#1b1512cc]";

  return (
    <div className="flex min-h-screen items-end justify-center bg-transparent p-6">
      <button
        type="button"
        onClick={() =>
          mode === "recording"
            ? void emit("hotkey-cancel")
            : undefined
        }
        className={`flex min-w-[180px] items-center gap-3 rounded-2xl border border-white/25 px-4 py-3 text-left text-white shadow-2xl backdrop-blur ${backgroundClass}`}
      >
        {mode === "cancelled" ? (
          <>
            <span className="inline-flex h-4 w-4 rounded-full bg-[#f1b24a]" />
            <div>
              <div className="text-sm font-semibold">已取消</div>
              <div className="text-xs text-white/70">本次录音不会进入转录</div>
            </div>
          </>
        ) : mode === "transcribing" ? (
          <>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 animate-bounce rounded-full bg-white/95 [animation-delay:-0.2s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-white/80 [animation-delay:-0.1s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-white/65" />
            </div>
            <div>
              <div className="text-sm font-semibold">thinking</div>
              <div className="text-xs text-white/70">正在转录音频</div>
            </div>
          </>
        ) : (
          <>
            <span className="inline-flex h-3.5 w-3.5 animate-pulse rounded-full bg-white" />
            <AudioBars level={audioLevel} active={mode === "recording"} />
            <div>
              <div className="text-sm font-semibold">{formatDuration(elapsed)}</div>
              <div className="text-xs text-white/70">点击悬浮窗可取消录音</div>
            </div>
          </>
        )}
      </button>
    </div>
  );
}
