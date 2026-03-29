import { useEffect, useMemo, useRef, useState } from "react";
import { getHotkeyDisplay, registerHotkeyBinding } from "../api/tauri";
import {
  SettingsPage,
  SettingsSection,
  primaryButtonClassName,
  secondaryButtonClassName,
} from "../components/settings-ui";
import { useAppStore } from "../stores/appStore";
import type { HotkeyBinding } from "../types";

const modifierCodes = new Set([
  "ControlLeft",
  "ControlRight",
  "ShiftLeft",
  "ShiftRight",
  "AltLeft",
  "AltRight",
  "MetaLeft",
  "MetaRight",
]);

function codeToVk(code: string): number {
  if (/^Key[A-Z]$/.test(code)) {
    return code.charCodeAt(3);
  }
  if (/^Digit[0-9]$/.test(code)) {
    return code.charCodeAt(5);
  }
  if (/^F([1-9]|1[0-2])$/.test(code)) {
    return 0x70 + Number(code.slice(1)) - 1;
  }

  const fixed: Record<string, number> = {
    Escape: 0x1b,
    Enter: 0x0d,
    Space: 0x20,
    Tab: 0x09,
    Backspace: 0x08,
    ArrowUp: 0x26,
    ArrowDown: 0x28,
    ArrowLeft: 0x25,
    ArrowRight: 0x27,
    AltLeft: 0xa4,
    AltRight: 0xa5,
    ControlLeft: 0xa2,
    ControlRight: 0xa3,
    ShiftLeft: 0xa0,
    ShiftRight: 0xa1,
    MetaLeft: 0x5b,
    MetaRight: 0x5c,
  };
  return fixed[code] ?? 0;
}

function labelFromCode(code: string): string {
  const fixed: Record<string, string> = {
    ControlLeft: "Ctrl",
    ControlRight: "Ctrl",
    ShiftLeft: "Shift",
    ShiftRight: "Shift",
    AltLeft: "Left Alt",
    AltRight: "Right Alt",
    MetaLeft: "Win",
    MetaRight: "Win",
    Escape: "Esc",
    Enter: "Enter",
    Space: "Space",
    Tab: "Tab",
    Backspace: "Backspace",
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
  };
  if (fixed[code]) {
    return fixed[code];
  }
  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3);
  }
  if (/^Digit[0-9]$/.test(code)) {
    return code.slice(5);
  }
  return code;
}

function bindingToMask(binding: HotkeyBinding): number {
  let mask = 0;
  if (binding.modifiers.ctrl) {
    mask |= 0x1;
  }
  if (binding.modifiers.shift) {
    mask |= 0x2;
  }
  if (binding.modifiers.altLeft || binding.modifiers.altRight) {
    mask |= 0x4;
  }
  if (binding.modifiers.win) {
    mask |= 0x8;
  }
  return mask;
}

function buildBinding(primaryCode: string, activeCodes: Iterable<string>): HotkeyBinding {
  const active = new Set(activeCodes);
  active.delete(primaryCode);

  const modifiers = {
    ctrl: active.has("ControlLeft") || active.has("ControlRight"),
    shift: active.has("ShiftLeft") || active.has("ShiftRight"),
    win: active.has("MetaLeft") || active.has("MetaRight"),
    altLeft: active.has("AltLeft"),
    altRight: active.has("AltRight"),
  };

  const parts = [
    modifiers.ctrl ? "Ctrl" : null,
    modifiers.shift ? "Shift" : null,
    modifiers.win ? "Win" : null,
    modifiers.altLeft ? "Left Alt" : null,
    modifiers.altRight ? "Right Alt" : null,
    labelFromCode(primaryCode),
  ].filter(Boolean) as string[];

  return {
    primaryCode,
    primaryKeyCode: codeToVk(primaryCode),
    display: parts.join("+"),
    modifiers,
  };
}

export function HotkeySettings() {
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const setToast = useAppStore((state) => state.setToast);
  const [display, setDisplay] = useState(settings.hotkeyBinding.display || "未设置");
  const [capturing, setCapturing] = useState(false);
  const [draftBinding, setDraftBinding] = useState<HotkeyBinding | null>(null);
  const activeCodesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setDisplay(settings.hotkeyBinding.display || "未设置");
  }, [settings.hotkeyBinding.display]);

  useEffect(() => {
    if (!capturing) {
      activeCodesRef.current.clear();
      return;
    }

    let finalized = false;

    const finishCapture = (binding: HotkeyBinding) => {
      if (finalized) {
        return;
      }
      finalized = true;
      setDraftBinding(binding);
      setDisplay(binding.display);
      setCapturing(false);
      activeCodesRef.current.clear();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      activeCodesRef.current.add(event.code);

      if (!modifierCodes.has(event.code)) {
        finishCapture(buildBinding(event.code, activeCodesRef.current));
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (modifierCodes.has(event.code) && activeCodesRef.current.size === 1) {
        finishCapture(buildBinding(event.code, []));
        return;
      }
      activeCodesRef.current.delete(event.code);
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, [capturing]);

  const activeBinding = draftBinding ?? settings.hotkeyBinding;
  const modifierSummary = useMemo(() => {
    const parts = [] as string[];
    if (activeBinding.modifiers.ctrl) parts.push("Ctrl");
    if (activeBinding.modifiers.shift) parts.push("Shift");
    if (activeBinding.modifiers.win) parts.push("Win");
    if (activeBinding.modifiers.altLeft) parts.push("Left Alt");
    if (activeBinding.modifiers.altRight) parts.push("Right Alt");
    return parts.length ? parts.join(" + ") : "无修饰键";
  }, [activeBinding]);

  return (
    <SettingsPage
      title="快捷键"
      description="使用真实键盘录制来设置主录音快捷键，支持单键、组合键，并区分左右 Alt。"
    >
      <SettingsSection title="录制快捷键" description="点击开始录制后，直接按下单键或组合键即可生成绑定。">
        <div className="space-y-3">
          <div>
            <div className="settings-field-label">当前快捷键</div>
            <div className="rounded-[12px] border border-line bg-panel px-4 py-3 font-mono text-xl font-semibold text-ink">
              {capturing ? "正在录制…" : display}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-[12px] border border-line bg-panel px-4 py-3 text-sm text-ink/72">
              <div className="text-xs text-ink/46">主键</div>
              <div className="mt-1 font-semibold text-ink">{labelFromCode(activeBinding.primaryCode)}</div>
            </div>
            <div className="rounded-[12px] border border-line bg-panel px-4 py-3 text-sm text-ink/72">
              <div className="text-xs text-ink/46">修饰键</div>
              <div className="mt-1 font-semibold text-ink">{modifierSummary}</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className={primaryButtonClassName} onClick={() => setCapturing(true)}>
              {capturing ? "等待按键…" : "录制快捷键"}
            </button>
            <button
              type="button"
              className={secondaryButtonClassName}
              onClick={() => {
                const binding = activeBinding;
                void registerHotkeyBinding(binding)
                  .then(() => getHotkeyDisplay())
                  .then((value) => {
                    setDisplay(value);
                    updateSettings({
                      hotkeyBinding: binding,
                      hotkeyModifiers: bindingToMask(binding),
                      hotkeyKeyCode: binding.primaryKeyCode,
                    });
                    setToast("快捷键配置已保存");
                  })
                  .catch((error) => setToast(error instanceof Error ? error.message : "保存快捷键失败"));
              }}
            >
              应用快捷键
            </button>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="使用方式" description="保持和当前实现一致的长按、单击、取消三种交互说明。">
        <div className="grid gap-2 xl:grid-cols-3">
          <div className="rounded-[12px] border border-line bg-panel px-3.5 py-3 text-sm leading-5 text-ink/72">
            <div className="font-semibold text-ink">长按模式</div>
            <div className="mt-1">按住开始录音，松开后自动停止并转录。</div>
          </div>
          <div className="rounded-[12px] border border-line bg-panel px-3.5 py-3 text-sm leading-5 text-ink/72">
            <div className="font-semibold text-ink">单击模式</div>
            <div className="mt-1">单击开始持续录音，再按一次停止。</div>
          </div>
          <div className="rounded-[12px] border border-line bg-panel px-3.5 py-3 text-sm leading-5 text-ink/72">
            <div className="font-semibold text-ink">取消录音</div>
            <div className="mt-1">录音过程中按 ESC，或点击悬浮录音窗取消。</div>
          </div>
        </div>
      </SettingsSection>
    </SettingsPage>
  );
}
