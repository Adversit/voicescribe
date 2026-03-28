import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { getHotkeyDisplay, registerHotkey } from "../api/tauri";
import {
  SettingsField,
  SettingsPage,
  SettingsSection,
  inputClassName,
  primaryButtonClassName,
} from "../components/settings-ui";
import { useAppStore } from "../stores/appStore";

const modifiers = [
  { key: "Ctrl", mask: 0x1 },
  { key: "Shift", mask: 0x2 },
  { key: "Alt", mask: 0x4 },
  { key: "Win", mask: 0x8 },
] as const;

export function HotkeySettings() {
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const setToast = useAppStore((state) => state.setToast);
  const [display, setDisplay] = useState("未设置");

  useEffect(() => {
    void getHotkeyDisplay()
      .then(setDisplay)
      .catch(() => setDisplay("未设置"));
  }, []);

  const currentModifiers = useMemo(
    () =>
      modifiers.reduce<Record<string, boolean>>((acc, item) => {
        acc[item.key] = (settings.hotkeyModifiers & item.mask) !== 0;
        return acc;
      }, {}),
    [settings.hotkeyModifiers],
  );

  const hasModifier = Object.values(currentModifiers).some(Boolean);

  return (
    <SettingsPage
      title="快捷键"
      description="压缩当前值、修饰键、主键和使用说明，尽量在默认窗口内完整展示。"
    >
      <SettingsSection title="录音快捷键" description="至少选择一个修饰键，再保存主键配置。">
        <div className="grid gap-3 xl:grid-cols-[210px_1fr_160px] xl:items-start">
          <div>
            <div className="settings-field-label">当前快捷键</div>
            <div className="rounded-[12px] border border-line bg-panel px-4 py-3 font-mono text-xl font-semibold text-ink">
              {display}
            </div>
          </div>

          <div>
            <div className="settings-field-label">修饰键</div>
            <div className="mt-1 grid gap-2 sm:grid-cols-2">
              {modifiers.map((modifier) => (
                <button
                  key={modifier.key}
                  type="button"
                  className={clsx("modifier-chip", currentModifiers[modifier.key] && "is-active")}
                  onClick={() => {
                    const nextMask = currentModifiers[modifier.key]
                      ? settings.hotkeyModifiers & ~modifier.mask
                      : settings.hotkeyModifiers | modifier.mask;
                    updateSettings({ hotkeyModifiers: nextMask });
                  }}
                >
                  {modifier.key}
                </button>
              ))}
            </div>
          </div>

          <SettingsField label="主键" hint="保留数字 keycode 输入，后续可再收成更友好的键位选择。">
            <input
              type="number"
              value={settings.hotkeyKeyCode}
              onChange={(event) => updateSettings({ hotkeyKeyCode: Number(event.target.value) || 0 })}
              className={inputClassName}
            />
          </SettingsField>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!hasModifier}
            onClick={() =>
              void registerHotkey(settings.hotkeyModifiers, settings.hotkeyKeyCode)
                .then(() => getHotkeyDisplay())
                .then((value) => {
                  setDisplay(value);
                  setToast("快捷键配置已保存");
                })
                .catch((error) =>
                  setToast(error instanceof Error ? error.message : "保存快捷键失败"),
                )
            }
            className={primaryButtonClassName}
          >
            应用快捷键
          </button>
          {!hasModifier ? <span className="text-sm text-[#9c4221]">至少需要选择一个修饰键。</span> : null}
        </div>
      </SettingsSection>

      <SettingsSection title="使用方式" description="保持和原版一致的长按、双击、取消三种交互说明。">
        <div className="grid gap-2 xl:grid-cols-3">
          <div className="rounded-[12px] border border-line bg-panel px-3.5 py-3 text-sm leading-5 text-ink/72">
            <div className="font-semibold text-ink">长按模式</div>
            <div className="mt-1">按住开始录音，松开后自动停止并转录。</div>
          </div>
          <div className="rounded-[12px] border border-line bg-panel px-3.5 py-3 text-sm leading-5 text-ink/72">
            <div className="font-semibold text-ink">双击模式</div>
            <div className="mt-1">快速双击开始持续录音，再按一次停止。</div>
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