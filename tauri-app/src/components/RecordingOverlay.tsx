import { useEffect, useMemo, useState, type ReactNode } from "react";
import { emitTo, listen } from "@tauri-apps/api/event";
import { Check, LoaderCircle, X } from "lucide-react";
import { debugHotkeyLog } from "../api/tauri";
import type { OverlayMode, OverlayStatePayload } from "../lib/overlayWindow";

const BAR_COUNT = 13;
const RADIAL_COUNT = Math.floor(BAR_COUNT / 2) + 1;
const IDLE_FLOOR = 0.06;
const CANCEL_LABEL = "取消录音";
const STOP_LABEL = "完成录音";
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

function mirrorRadial(radial: number[]) {
  return [...radial.slice(1).reverse(), ...radial];
}

function createIdleBars() {
  const radial = Array.from({ length: RADIAL_COUNT }, (_, index) => Math.max(IDLE_FLOOR, 0.14 - index * 0.012));
  return mirrorRadial(radial);
}

function normalizeScalarLevel(level: number) {
  if (!Number.isFinite(level)) {
    return IDLE_FLOOR;
  }

  const boosted = Math.pow(Math.min(1, Math.max(0, level) * 1.35), 0.86);
  return Math.max(IDLE_FLOOR, Math.min(1, boosted));
}

function createBarsFromScalar(level = IDLE_FLOOR) {
  const center = normalizeScalarLevel(level);
  const radial = Array.from({ length: RADIAL_COUNT }, (_, index) => {
    const decay = Math.max(0.35, 1 - index * 0.11);
    return Math.max(IDLE_FLOOR, center * decay);
  });
  return mirrorRadial(radial);
}

function decodePcm16(base64Payload: string) {
  try {
    const binary = globalThis.atob(base64Payload);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    const view = new DataView(bytes.buffer);
    const samples = new Int16Array(bytes.byteLength / 2);
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = view.getInt16(index * 2, true);
    }
    return samples;
  } catch {
    return new Int16Array();
  }
}

function createBarsFromAudioChunk(base64Payload: string) {
  const samples = decodePcm16(base64Payload);
  if (samples.length === 0) {
    return createIdleBars();
  }

  const windowSize = Math.max(160, Math.floor(samples.length / RADIAL_COUNT));
  const radial = Array.from({ length: RADIAL_COUNT }, (_, index) => {
    const end = Math.max(0, samples.length - index * windowSize);
    const start = Math.max(0, end - windowSize);
    if (start >= end) {
      return IDLE_FLOOR;
    }

    let energy = 0;
    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      const normalized = samples[sampleIndex] / 32768;
      energy += normalized * normalized;
    }

    const rms = Math.sqrt(energy / (end - start));
    const boosted = Math.pow(Math.min(1, rms * 6.8), 0.66);
    const decay = Math.max(0.38, 1 - index * 0.09);
    return Math.max(IDLE_FLOOR, Math.min(1, boosted * decay));
  });

  const smoothed = radial.map((value, index) => {
    const prev = index > 0 ? radial[index - 1] : value;
    const next = index + 1 < radial.length ? radial[index + 1] : value;
    return Math.max(IDLE_FLOOR, Math.min(1, value * 0.62 + prev * 0.24 + next * 0.14));
  });

  return mirrorRadial(smoothed);
}

function RealWaveform({ levels }: { levels: number[] }) {
  return (
    <div className="flex h-8 items-center gap-[5px] px-1">
      {levels.map((level, index) => {
        const height = Math.round(6 + level * 22);
        return (
          <span
            key={`${index}-${height}`}
            className="block w-[4px] rounded-full bg-white transition-[height,opacity] duration-75"
            style={{ height, opacity: 0.38 + level * 0.62 }}
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
  const baseClass =
    variant === "light"
      ? "bg-white text-black hover:bg-white/90"
      : "bg-white/14 text-white hover:bg-white/22";

  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] transition ${baseClass} ${disabled ? "cursor-not-allowed opacity-35" : ""}`}
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
  const [levels, setLevels] = useState<number[]>(() => createIdleBars());
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let unlistenState: (() => void) | undefined;
    let unlistenAudioLevel: (() => void) | undefined;
    let unlistenAudioChunk: (() => void) | undefined;

    const bind = async () => {
      await debugHotkeyLog("overlay bind start").catch(() => undefined);

      unlistenState = await listen<OverlayStatePayload>("overlay-state", (event) => {
        const payload = event.payload;
        void debugHotkeyLog(
          `overlay received state mode=${payload.mode} canCancel=${Boolean(payload.canCancel)} canStop=${Boolean(payload.canStop)}`,
        ).catch(() => undefined);
        setMode(payload.mode);
        setStartedAt(payload.mode === "recording" ? (payload.startedAt ?? Date.now()) : null);
        setCanCancel(Boolean(payload.canCancel));
        setCanStop(Boolean(payload.canStop));

        if (payload.mode === "recording") {
          setLevels(createBarsFromScalar(payload.audioLevel ?? IDLE_FLOOR));
          return;
        }

        setLevels(createIdleBars());
      });

      unlistenAudioLevel = await listen<number>("audio-level", (event) => {
        setLevels((current) => {
          const next = createBarsFromScalar(event.payload ?? 0);
          return current.map((value, index) => value * 0.28 + next[index] * 0.72);
        });
      });

      unlistenAudioChunk = await listen<string>("audio-chunk", (event) => {
        setLevels(createBarsFromAudioChunk(event.payload));
      });

      await debugHotkeyLog("overlay bind success").catch(() => undefined);
      await emitTo("main", "overlay-ready");
      await debugHotkeyLog("overlay-ready emitted to main").catch(() => undefined);
    };

    void bind().catch((error) => {
      void debugHotkeyLog(`overlay bind failed: ${String(error)}`).catch(() => undefined);
    });

    return () => {
      unlistenState?.();
      unlistenAudioLevel?.();
      unlistenAudioChunk?.();
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

    void debugHotkeyLog("overlay click cancel").catch(() => undefined);
    void emitTo("main", "overlay-cancel-recording");
  };

  const handleStop = () => {
    if (!canStop) {
      return;
    }

    void debugHotkeyLog("overlay click stop").catch(() => undefined);
    void emitTo("main", "overlay-stop-recording");
  };

  return (
    <div className="pointer-events-none flex min-h-screen items-end justify-center bg-transparent px-4 pb-8">
      {mode === "recording" ? (
        <div className="pointer-events-auto flex min-w-[248px] items-center gap-2.5 rounded-full border border-white/10 bg-black px-2.5 py-2.5 text-white shadow-[0_16px_36px_rgba(0,0,0,0.34)]">
          <IconButton label={CANCEL_LABEL} disabled={!canCancel} variant="muted" onClick={handleCancel}>
            <X className="h-5 w-5" strokeWidth={2.3} />
          </IconButton>

          <div className="flex min-w-[128px] flex-1 flex-col items-center justify-center gap-1">
            <RealWaveform levels={levels} />
            <div className="text-[10px] font-medium tracking-[0.24em] text-white/58">
              {formatDuration(elapsed)}
            </div>
          </div>

          <IconButton label={STOP_LABEL} disabled={!canStop} variant="light" onClick={handleStop}>
            <Check className="h-5 w-5" strokeWidth={2.8} />
          </IconButton>
        </div>
      ) : mode === "transcribing" ? (
        <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-white/10 bg-black px-5 py-3 text-white shadow-[0_16px_36px_rgba(0,0,0,0.30)]">
          <LoaderCircle className="h-4 w-4 animate-spin text-white/78" strokeWidth={2.2} />
          <div className="text-sm font-medium tracking-[0.06em] text-white/86">{TRANSCRIBING_LABEL}</div>
        </div>
      ) : (
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-black px-4 py-2.5 text-white shadow-[0_14px_30px_rgba(0,0,0,0.28)]">
          <X className="h-4 w-4 text-white/78" strokeWidth={2.4} />
          <div className="text-sm font-medium text-white/86">{CANCELLED_LABEL}</div>
        </div>
      )}
    </div>
  );
}