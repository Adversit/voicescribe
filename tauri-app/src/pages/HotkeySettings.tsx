import { useEffect, useMemo, useState } from "react";
import { getHotkeyDisplay, registerHotkey } from "../api/tauri";
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
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-[28px] font-semibold text-ink">快捷键</h1>
        <p className="max-w-3xl text-sm leading-6 text-ink/60">
          结构与原版一致：先看当前快捷键，再调整修饰键和主键，最后确认录音触发方式。
        </p>
      </header>

      <section className="rounded-[22px] border border-[#e4dbc9] bg-[#faf6ef] p-4">
        <div className="text-base font-semibold text-ink">录音快捷键</div>
        <div className="mt-3 rounded-2xl border border-[#ddd2c0] bg-white px-4 py-4 font-mono text-2xl font-semibold text-ink">
          {display}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {modifiers.map((modifier) => (
            <label
              key={modifier.key}
              className="flex items-center justify-between rounded-2xl border border-[#e4dbc9] bg-white px-4 py-3"
            >
              <span>{modifier.key}</span>
              <input
                type="checkbox"
                checked={currentModifiers[modifier.key]}
                onChange={(event) => {
                  const nextMask = event.target.checked
                    ? settings.hotkeyModifiers | modifier.mask
                    : settings.hotkeyModifiers & ~modifier.mask;
                  updateSettings({ hotkeyModifiers: nextMask });
                }}
                className="h-5 w-5 accent-accent"
              />
            </label>
          ))}
        </div>

        <label className="mt-4 block text-sm text-ink/70">
          主键（Virtual Key Code）
          <input
            type="number"
            value={settings.hotkeyKeyCode}
            onChange={(event) => updateSettings({ hotkeyKeyCode: Number(event.target.value) || 0 })}
            className="mt-2 w-full max-w-xs rounded-2xl border border-[#ddd2c0] bg-white px-4 py-3"
          />
        </label>

        <div className="mt-4 flex flex-wrap items-center gap-3">
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
            className="rounded-full bg-accent px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            应用快捷键
          </button>
          {!hasModifier ? <span className="text-sm text-[#a53f1c]">至少需要选择一个修饰键。</span> : null}
        </div>
      </section>

      <section className="rounded-[22px] border border-[#e4dbc9] bg-[#faf6ef] p-4">
        <div className="text-base font-semibold text-ink">使用方式</div>
        <div className="mt-4 space-y-3 text-sm leading-6 text-ink/70">
          <div className="rounded-2xl border border-[#e4dbc9] bg-white px-4 py-4">
            <div className="font-semibold text-ink">长按模式</div>
            <div className="mt-1">按住快捷键开始录音，松开后自动停止并转录。</div>
          </div>
          <div className="rounded-2xl border border-[#e4dbc9] bg-white px-4 py-4">
            <div className="font-semibold text-ink">双击模式</div>
            <div className="mt-1">快速双击开始持续录音，再按一次停止并转录。</div>
          </div>
          <div className="rounded-2xl border border-[#e4dbc9] bg-white px-4 py-4">
            <div className="font-semibold text-ink">取消录音</div>
            <div className="mt-1">录音过程中按 ESC，或点击悬浮录音窗，可取消当前录音。</div>
          </div>
        </div>
      </section>
    </div>
  );
}
