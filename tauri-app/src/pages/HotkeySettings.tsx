import { useEffect, useMemo, useRef, useState } from "react";
import { debugHotkeyLog, resumeHotkeyRuntime, suspendHotkeyRuntime } from "../api/tauri";
import {
  SettingsPage,
  SettingsSection,
  primaryButtonClassName,
  secondaryButtonClassName,
} from "../components/settings-ui";
import { useAppStore } from "../stores/appStore";
import type { HotkeyBinding } from "../types";

const TEXT = {
  notSet: "\u672a\u8bbe\u7f6e",
  waiting: "\u8bf7\u6309\u4e0b 1 \u4e2a\u6216 2 \u4e2a\u952e",
  title: "\u5feb\u6377\u952e",
  pageDescription:
    "\u8bbe\u7f6e\u9875\u4f7f\u7528\u5f53\u524d\u7a97\u53e3\u7684\u771f\u5b9e keydown/keyup \u5f55\u5236\u6309\u952e\uff0c\u8fd0\u884c\u65f6\u4ecd\u7531 Rust Windows \u4f4e\u5c42 hook \u8d1f\u8d23\u5168\u5c40\u70ed\u952e\u547d\u4e2d\u3002",
  sectionTitle: "\u5f55\u5236\u5feb\u6377\u952e",
  sectionDescription:
    "\u70b9\u51fb\u5f00\u59cb\u5f55\u5236\uff0c\u76f4\u63a5\u5728\u5f53\u524d\u7a97\u53e3\u6309\u4e0b 1 \u4e2a\u6216 2 \u4e2a\u952e\uff0c\u5de6\u53f3 Alt \u4f1a\u5206\u5f00\u8bb0\u5f55\u3002",
  currentLabel: "\u5f53\u524d\u5feb\u6377\u952e",
  keyCountLabel: "\u952e\u4f4d\u6570\u91cf",
  vkLabel: "Windows VK",
  startCapture: "\u5f00\u59cb\u5f55\u5236",
  stopCapture: "\u505c\u6b62\u5f55\u5236",
  apply: "\u5e94\u7528\u5feb\u6377\u952e",
  saveSuccess: "\u5feb\u6377\u952e\u5df2\u4fdd\u5b58",
  captureSuspendFailed: "\u6682\u505c\u8fd0\u884c\u65f6\u70ed\u952e\u5931\u8d25",
  captureResumeFailed: "\u6062\u590d\u8fd0\u884c\u65f6\u70ed\u952e\u5931\u8d25",
  captureOverflow: "\u6700\u591a\u53ea\u80fd\u5f55\u5236 2 \u4e2a\u952e",
  usageTitle: "\u4f7f\u7528\u8bf4\u660e",
  usageDescription:
    "\u5f55\u97f3\u884c\u4e3a\u4fdd\u6301\u73b0\u6709\u72b6\u6001\u673a\uff1a\u5355\u51fb\u5207\u6362\u5f55\u97f3\uff0c\u957f\u6309\u5f00\u59cb\uff0c\u677e\u5f00\u505c\u6b62\uff0cEsc \u53d6\u6d88\u3002",
  singleTapTitle: "\u5355\u51fb\u5207\u6362",
  singleTapDescription:
    "\u7a7a\u95f2\u65f6\u5355\u51fb\u5f00\u59cb\u5f55\u97f3\uff0c\u5f55\u97f3\u4e2d\u518d\u6309\u4e00\u6b21\u505c\u6b62\u5e76\u8f6c\u5f55\u3002",
  holdTitle: "\u957f\u6309\u4fdd\u6301",
  holdDescription:
    "\u6309\u4f4f\u8d85\u8fc7\u9608\u503c\u540e\u5f00\u59cb\u5f55\u97f3\uff0c\u677e\u5f00\u540c\u4e00\u7ec4\u952e\u5373\u505c\u6b62\u3002",
  cancelTitle: "\u53d6\u6d88\u5f55\u97f3",
  cancelDescription: "\u5f55\u97f3\u4e2d\u53ef\u4ee5\u6309 Esc \u6216\u4f7f\u7528\u60ac\u6d6e\u7a97\u53d6\u6d88\u64cd\u4f5c\u3002",
};

function formatKeys(keys: number[]): string {
  if (keys.length === 0) {
    return "-";
  }

  return keys.map((key) => `0x${key.toString(16).toUpperCase()}`).join(" + ");
}

function hotkeyLabelFromVk(vk: number): string {
  switch (vk) {
    case 0xA0:
      return "\u5de6 Shift";
    case 0xA1:
      return "\u53f3 Shift";
    case 0xA2:
      return "\u5de6 Ctrl";
    case 0xA3:
      return "\u53f3 Ctrl";
    case 0xA4:
      return "\u5de6 Alt";
    case 0xA5:
      return "\u53f3 Alt";
    case 0x5B:
      return "\u5de6 Win";
    case 0x5C:
      return "\u53f3 Win";
    case 0x1B:
      return "Esc";
    case 0x0D:
      return "\u56de\u8f66";
    case 0x20:
      return "\u7a7a\u683c";
    case 0x09:
      return "Tab";
    case 0x08:
      return "\u9000\u683c";
    case 0x25:
      return "\u5de6";
    case 0x26:
      return "\u4e0a";
    case 0x27:
      return "\u53f3";
    case 0x28:
      return "\u4e0b";
    default:
      if ((vk >= 0x30 && vk <= 0x39) || (vk >= 0x41 && vk <= 0x5a)) {
        return String.fromCharCode(vk);
      }
      if (vk >= 0x70 && vk <= 0x7b) {
        return `F${vk - 0x6f}`;
      }
      return `VK_${vk}`;
  }
}

function displayFromKeys(keys: number[]): string {
  if (keys.length === 0) {
    return TEXT.notSet;
  }

  return keys.map((key) => hotkeyLabelFromVk(key)).join("+");
}

function normalizeCaptureKeys(keys: Iterable<number>): number[] {
  const normalized = [...new Set([...keys].filter((value) => Number.isInteger(value) && value > 0))].sort(
    (left, right) => left - right,
  );
  return normalized.length === 1 || normalized.length === 2 ? normalized : [];
}

function createBindingFromKeys(keys: Iterable<number>): HotkeyBinding | null {
  const normalized = normalizeCaptureKeys(keys);
  if (normalized.length === 0) {
    return null;
  }

  return {
    keys: normalized,
    display: displayFromKeys(normalized),
  };
}

function formatBindingSummary(binding: HotkeyBinding | null | undefined): string {
  if (!binding) {
    return "null";
  }

  return `display=${binding.display || TEXT.notSet} keys=${formatKeys(binding.keys)}`;
}

function normalizeBrowserCapturedVk(event: KeyboardEvent): number | null {
  switch (event.code) {
    case "AltLeft":
      return 0xA4;
    case "AltRight":
      return 0xA5;
    case "ControlLeft":
      return 0xA2;
    case "ControlRight":
      return 0xA3;
    case "ShiftLeft":
      return 0xA0;
    case "ShiftRight":
      return 0xA1;
    case "MetaLeft":
      return 0x5B;
    case "MetaRight":
      return 0x5C;
    case "Space":
      return 0x20;
    case "Tab":
      return 0x09;
    case "Enter":
    case "NumpadEnter":
      return 0x0D;
    case "Backspace":
      return 0x08;
    case "ArrowLeft":
      return 0x25;
    case "ArrowUp":
      return 0x26;
    case "ArrowRight":
      return 0x27;
    case "ArrowDown":
      return 0x28;
    default:
      break;
  }

  if (event.code.startsWith("Key")) {
    return event.code.charCodeAt(3);
  }

  if (event.code.startsWith("Digit")) {
    return event.code.charCodeAt(5);
  }

  if (/^F([1-9]|1[0-2])$/.test(event.code)) {
    return 0x6f + Number(event.code.slice(1));
  }

  return null;
}

function blurActiveElement() {
  if (typeof document === "undefined") {
    return;
  }

  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    active.blur();
  }
}

function logHotkeyUi(message: string) {
  void debugHotkeyLog(`hotkey-settings ${message}`).catch(() => undefined);
}
function createTraceId() {
  const random = Math.random().toString(16).slice(2, 8);
  return `hotkey-apply-${Date.now()}-${random}`;
}


export function HotkeySettings() {
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const setHotkeyApplyTraceId = useAppStore((state) => state.setHotkeyApplyTraceId);
  const setToast = useAppStore((state) => state.setToast);
  const [display, setDisplay] = useState(settings.hotkeyBinding.display || TEXT.notSet);
  const [capturing, setCapturing] = useState(false);
  const [draftBinding, setDraftBinding] = useState<HotkeyBinding | null>(null);
  const captureKeysRef = useRef<Set<number>>(new Set());
  const captureTraceRef = useRef<string | null>(null);
  const [captureKeysPreview, setCaptureKeysPreview] = useState<number[]>([]);
  const canApplyDraft = !capturing && draftBinding !== null;


  useEffect(() => {
    if (!capturing) {
      captureKeysRef.current.clear();
      setCaptureKeysPreview([]);
      return;
    }

    logHotkeyUi(`bind browser capture start trace_id=${captureTraceRef.current ?? "none"}`);

    const completeCapture = (keys: Iterable<number>, reason: string) => {
      const binding = createBindingFromKeys(keys);
      if (!binding) {
        logHotkeyUi(`browser capture complete ignored trace_id=${captureTraceRef.current ?? "none"} reason=${reason} keys=${formatKeys([...keys])}`);
        return;
      }

      logHotkeyUi(`browser capture complete trace_id=${captureTraceRef.current ?? "none"} reason=${reason} ${formatBindingSummary(binding)}`);
      setDraftBinding(binding);
      setDisplay(binding.display || TEXT.notSet);
      captureKeysRef.current.clear();
      setCaptureKeysPreview([]);
      setCapturing(false);
    };

    const cancelCapture = (reason: string) => {
      logHotkeyUi(`browser capture cancelled trace_id=${captureTraceRef.current ?? "none"} reason=${reason}`);
      captureKeysRef.current.clear();
      setCaptureKeysPreview([]);
      setCapturing(false);
      setDisplay(settings.hotkeyBinding.display || TEXT.notSet);
      captureTraceRef.current = null;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.code === "Escape") {
        cancelCapture("escape");
        return;
      }

      const key = normalizeBrowserCapturedVk(event);
      if (key === null) {
        logHotkeyUi(`browser keydown ignored trace_id=${captureTraceRef.current ?? "none"} code=${event.code} location=${event.location}`);
        return;
      }

      captureKeysRef.current.add(key);
      const preview = [...captureKeysRef.current].sort((left, right) => left - right);
      setCaptureKeysPreview(preview);
      logHotkeyUi(
        `browser keydown trace_id=${captureTraceRef.current ?? "none"} code=${event.code} location=${event.location} key=0x${key.toString(16).toUpperCase()} pressed=${formatKeys(preview)}`,
      );

      if (captureKeysRef.current.size > 2) {
        logHotkeyUi(`browser capture overflow trace_id=${captureTraceRef.current ?? "none"} pressed=${formatKeys(preview)}`);
        setToast(TEXT.captureOverflow);
        cancelCapture("overflow");
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const key = normalizeBrowserCapturedVk(event);
      if (key === null) {
        logHotkeyUi(`browser keyup ignored trace_id=${captureTraceRef.current ?? "none"} code=${event.code} location=${event.location}`);
        return;
      }

      captureKeysRef.current.add(key);
      const snapshot = [...captureKeysRef.current].sort((left, right) => left - right);
      logHotkeyUi(
        `browser keyup trace_id=${captureTraceRef.current ?? "none"} code=${event.code} location=${event.location} key=0x${key.toString(16).toUpperCase()} pressed=${formatKeys(snapshot)}`,
      );
      completeCapture(snapshot, "keyup");
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      const traceId = captureTraceRef.current ?? undefined;
      logHotkeyUi(`unbind browser capture trace_id=${traceId ?? "none"}`);
      void resumeHotkeyRuntime(traceId, "capture-cleanup")
        .then(() => {
          logHotkeyUi(`runtime hotkey resumed after capture trace_id=${traceId ?? "none"}`);
        })
        .catch((error) => {
          logHotkeyUi(`runtime hotkey resume failed trace_id=${traceId ?? "none"} error=${String(error)}`);
          setToast(TEXT.captureResumeFailed);
        });
    };
  }, [capturing, setToast, settings.hotkeyBinding.display]);

  useEffect(() => {
    if (!draftBinding) {
      setDisplay(settings.hotkeyBinding.display || TEXT.notSet);
    }
  }, [draftBinding, settings.hotkeyBinding.display]);

  const handleToggleCapture = () => {
    blurActiveElement();

    if (capturing) {
      logHotkeyUi(
        `capture button action=stop trace_id=${captureTraceRef.current ?? "none"} display=${display} draft=${formatBindingSummary(draftBinding)} settings=${formatBindingSummary(settings.hotkeyBinding)}`,
      );
      captureKeysRef.current.clear();
      setCaptureKeysPreview([]);
      setCapturing(false);
      setDisplay(settings.hotkeyBinding.display || TEXT.notSet);
      captureTraceRef.current = null;
      return;
    }

    const traceId = createTraceId();
    captureTraceRef.current = traceId;
    logHotkeyUi(
      `capture button action=start trace_id=${traceId} display=${display} draft=${formatBindingSummary(draftBinding)} settings=${formatBindingSummary(settings.hotkeyBinding)}`,
    );
    void suspendHotkeyRuntime()
      .then(() => {
        logHotkeyUi(`runtime hotkey suspended for capture trace_id=${traceId}`);
        setDraftBinding(null);
        captureKeysRef.current.clear();
        setCaptureKeysPreview([]);
        setDisplay(TEXT.waiting);
        setCapturing(true);
      })
      .catch((error) => {
        logHotkeyUi(`runtime hotkey suspend failed trace_id=${traceId} error=${String(error)}`);
        setToast(TEXT.captureSuspendFailed);
        captureTraceRef.current = null;
      });
  };

  const activeBinding = draftBinding ?? settings.hotkeyBinding;
  const visibleKeys = capturing ? captureKeysPreview : activeBinding.keys;
  const keyCountLabel = useMemo(() => `${visibleKeys.length}`, [visibleKeys.length]);
  const vkSummary = useMemo(() => formatKeys(visibleKeys), [visibleKeys]);
  const capturePreview = useMemo(
    () => (captureKeysPreview.length > 0 ? displayFromKeys(captureKeysPreview) : TEXT.waiting),
    [captureKeysPreview],
  );

  return (
    <SettingsPage title={TEXT.title} description={TEXT.pageDescription}>
      <SettingsSection title={TEXT.sectionTitle} description={TEXT.sectionDescription}>
        <div className="space-y-3">
          <div>
            <div className="settings-field-label">{TEXT.currentLabel}</div>
            <div className="rounded-[12px] border border-line bg-panel px-4 py-3 font-mono text-xl font-semibold text-ink">
              {capturing ? capturePreview : display}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-[12px] border border-line bg-panel px-4 py-3 text-sm text-ink/72">
              <div className="text-xs text-ink/46">{TEXT.keyCountLabel}</div>
              <div className="mt-1 font-semibold text-ink">{keyCountLabel}</div>
            </div>
            <div className="rounded-[12px] border border-line bg-panel px-4 py-3 text-sm text-ink/72">
              <div className="text-xs text-ink/46">{TEXT.vkLabel}</div>
              <div className="mt-1 font-semibold text-ink">{vkSummary}</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className={primaryButtonClassName} onClick={handleToggleCapture}>
              {capturing ? TEXT.stopCapture : TEXT.startCapture}
            </button>
            <button
              type="button"
              className={secondaryButtonClassName}
              disabled={!canApplyDraft}
              onClick={() => {
                if (!draftBinding) {
                  logHotkeyUi("capture apply ignored reason=no-draft");
                  return;
                }
                const binding = draftBinding;
                const traceId = captureTraceRef.current ?? createTraceId();
                captureTraceRef.current = traceId;
                logHotkeyUi(
                  `capture apply requested trace_id=${traceId} ${formatBindingSummary(binding)} previous=${formatBindingSummary(settings.hotkeyBinding)}`,
                );
                setHotkeyApplyTraceId(traceId);
                updateSettings({
                  hotkeyBinding: binding,
                });
                setDisplay(binding.display || TEXT.notSet);
                setDraftBinding(null);
                logHotkeyUi(`capture apply state-updated trace_id=${traceId} ${formatBindingSummary(binding)}`);
                captureTraceRef.current = null;
                setToast(TEXT.saveSuccess);
              }}
            >
              {TEXT.apply}
            </button>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title={TEXT.usageTitle} description={TEXT.usageDescription}>
        <div className="grid gap-2 xl:grid-cols-3">
          <div className="rounded-[12px] border border-line bg-panel px-3.5 py-3 text-sm leading-5 text-ink/72">
            <div className="font-semibold text-ink">{TEXT.singleTapTitle}</div>
            <div className="mt-1">{TEXT.singleTapDescription}</div>
          </div>
          <div className="rounded-[12px] border border-line bg-panel px-3.5 py-3 text-sm leading-5 text-ink/72">
            <div className="font-semibold text-ink">{TEXT.holdTitle}</div>
            <div className="mt-1">{TEXT.holdDescription}</div>
          </div>
          <div className="rounded-[12px] border border-line bg-panel px-3.5 py-3 text-sm leading-5 text-ink/72">
            <div className="font-semibold text-ink">{TEXT.cancelTitle}</div>
            <div className="mt-1">{TEXT.cancelDescription}</div>
          </div>
        </div>
      </SettingsSection>
    </SettingsPage>
  );
}
