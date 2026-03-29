import { useEffect, useMemo, useState, type ReactNode } from "react";
import { emitTo, listen } from "@tauri-apps/api/event";
import { LoaderCircle, Square, X } from "lucide-react";
import type { OverlayMode, OverlayStatePayload } from "../lib/overlayWindow";

const HISTORY_SIZE = 13;
const IDLE_LEVEL = 0.08;
const CANCEL_LABEL = "取消录音";
const STOP_LABEL = "停止录音";
const TRANSCRIBING_LABEL = "正在转录";
const CANCELLED_LABEL = "已取消录音";

function formatDuration(milliseconds: number | null) {
  if (!milliseconds) {
    return "00:00";
  }

  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function createLevelHistory(level = IDLE_LEVEL) {
  return Array.from({ length: HISTORY_SIZE }, (_, index) => {
    const taper = 1 - Math.abs(index - Math.floor(HISTORY_SIZE / 2)) / HISTORY_SIZE;
    return Math.max(IDLE_LEVEL, level * (0.7 + taper * 0.45));
  });
}

function normalizeLevel(level: number) {
  if (!Number.isFinite(level)) {
    return IDLE_LEVEL;
  }

  return Math.max(IDLE_LEVEL, Math.min(1, level));
}

function RealWaveform({ levels }: { levels: number[] }) {
  return (
    <div className="flex h-7 items-center gap-1 px-1">
      {levels.map((level, index) => {
        const height = Math.round(4 + normalizeLevel(level) * 20);
        return (
          <span
            key={`${index}-${height}`}
            className="block w-[3px] rounded-full bg-white transition-[height,opacity] duration-75"
            style={{ height, opacity: 0.45 + normalizeLevel(level) * 0.55 }}
          />
        );
      })}
    </div>
  );
}

function IconButton(props: {
  label: string;
  disabled: boolean;
  variant: "muted" | "light";
  onClick: () => void;
  children: ReactNode;
}) {
  const { label, disabled, variant, onClick, children } = props;
  const baseClass = variant === "light"
    ? "bg-white text-black hover:bg-white/90"
    : "bg-white/14 text-white hover:bg-white/22";

  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] transition ${baseClass} ${disabled ? "cursor-not-allowed opacity-35" : ""}`}
    >
      {children}
    </button>
  );
}

export function RecordingOverlay() {
  const [mode, setMode] = useState<OverlayMode>("hidden");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [canCancel, setCanCancel] = useState(false);
  const [canStop, setCanStop] = useState(false);
  const [levels, setLevels] = useState<number[]>(() => createLevelHistory());
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let unlistenState: (() => void) | undefined;
    let unlistenAudio: (() => void) | undefined;

    const bind = async () => {
      unlistenState = await listen<OverlayStatePayload>("overlay-state", (event) => {
        const payload = event.payload;
        setMode(payload.mode);
        setStartedAt(payload.mode === "recording" ? (payload.startedAt ?? Date.now()) : null);
        setCanCancel(Boolean(payload.canCancel));
        setCanStop(Boolean(payload.canStop));

        if (payload.mode === "recording") {
          setLevels(createLevelHistory(payload.audioLevel ?? IDLE_LEVEL));
          return;
        }

        setLevels(createLevelHistory());
      });

      unlistenAudio = await listen<number>("audio-level", (event) => {
        const nextLevel = normalizeLevel(event.payload ?? 0);
        setLevels((current) => [...current.slice(1), nextLevel]);
      });

      await emitTo("main", "overlay-ready");
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

    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, [mode]);

  const elapsed = useMemo(() => {
    if (mode !== "recording" || !startedAt) {
      return null;
    }
    return now - startedAt;
  }, [mode, now, startedAt]);

  if (mode === "hidden") {
    return null;
  }

  const handleCancel = () => {
    if (!canCancel) {
      return;
    }

    void emitTo("main", "overlay-cancel-recording");
  };

  const handleStop = () => {
    if (!canStop) {
      return;
    }

    void emitTo("main", "overlay-stop-recording");
  };

  return (
    <div className="pointer-events-none flex min-h-screen items-end justify-center bg-transparent px-4 pb-8">
      {mode === "recording" ? (
        <div className="pointer-events-auto flex min-w-[290px] items-center gap-3 rounded-full border border-white/10 bg-[rgba(10,10,10,0.96)] px-3 py-3 text-white shadow-[0_16px_36px_rgba(0,0,0,0.34)] backdrop-blur-xl">
          <IconButton label={CANCEL_LABEL} disabled={!canCancel} variant="muted" onClick={handleCancel}>
            <X className="h-5 w-5" strokeWidth={2.3} />
          </IconButton>

          <div className="flex min-w-[118px] flex-1 flex-col items-center justify-center gap-1">
            <RealWaveform levels={levels} />
            <div className="text-[10px] font-medium tracking-[0.24em] text-white/58">
              {formatDuration(elapsed)}
            </div>
          </div>

          <IconButton label={STOP_LABEL} disabled={!canStop} variant="light" onClick={handleStop}>
            <Square className="h-[18px] w-[18px] fill-current" strokeWidth={1.8} />
          </IconButton>
        </div>
      ) : mode === "transcribing" ? (
        <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-white/10 bg-[rgba(12,12,12,0.95)] px-5 py-3 text-white shadow-[0_16px_36px_rgba(0,0,0,0.30)] backdrop-blur-xl">
          <LoaderCircle className="h-4 w-4 animate-spin text-white/78" strokeWidth={2.2} />
          <div className="text-sm font-medium tracking-[0.06em] text-white/86">{TRANSCRIBING_LABEL}</div>
        </div>
      ) : (
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-[#b56d2f]/30 bg-[rgba(40,24,8,0.94)] px-4 py-2.5 text-[#ffd7ae] shadow-[0_14px_30px_rgba(0,0,0,0.28)] backdrop-blur-xl">
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-[#ffb25c]" />
          <div className="text-sm font-medium">{CANCELLED_LABEL}</div>
        </div>
      )}
    </div>
  );
}
