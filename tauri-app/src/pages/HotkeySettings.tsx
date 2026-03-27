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
    <div className="space-y-3.5">
      <header className="space-y-1">
        <h1 className="text-[22px] font-semibold text-ink">快捷键</h1>
        <p className="max-w-3xl text-xs leading-5 text-ink/60">
          当前值、修饰键、主键和使用方式都尽量压缩在一屏内，减少为阅读说明而整页滚动。
        </p>
      </header>

      <section className="rounded-[18px] border border-[#e4dbc9] bg-[#faf6ef] px-4 py-3">
        <div className="grid gap-3 xl:grid-cols-[220px_1fr_auto] xl:items-start">
          <div>
            <div className="text-[15px] font-semibold text-ink">当前快捷键</div>
            <div className="mt-2 rounded-2xl border border-[#ddd2c0] bg-white px-4 py-3 font-mono text-xl font-semibold text-ink">
              {display}
            </div>
          </div>

          <div>
            <div className="text-[15px] font-semibold text-ink">修饰键</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {modifiers.map((modifier) => (
                <label
                  key={modifier.key}
                  className="flex items-center justify-between rounded-2xl border border-[#e4dbc9] bg-white px-3 py-2.5"
                >
                  <span className="text-sm">{modifier.key}</span>
                  <input
                    type="checkbox"
                    checked={currentModifiers[modifier.key]}
                    onChange={(event) => {
                      const nextMask = event.target.checked
                        ? settings.hotkeyModifiers | modifier.mask
                        : settings.hotkeyModifiers & ~modifier.mask;
                      updateSettings({ hotkeyModifiers: nextMask });
                    }}
                    className="h-4.5 w-4.5 accent-accent"
                  />
                </label>
              ))}
            </div>
          </div>

          <label className="block text-sm text-ink/70 xl:min-w-[180px]">
            主键
            <input
              type="number"
              value={settings.hotkeyKeyCode}
              onChange={(event) => updateSettings({ hotkeyKeyCode: Number(event.target.value) || 0 })}
              className="mt-1.5 w-full rounded-2xl border border-[#ddd2c0] bg-white px-4 py-2.5"
            />
          </label>
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
            className="rounded-full bg-accent px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            应用快捷键
          </button>
          {!hasModifier ? <span className="text-sm text-[#a53f1c]">至少需要选择一个修饰键。</span> : null}
        </div>
      </section>

      <section className="rounded-[18px] border border-[#e4dbc9] bg-[#faf6ef] px-4 py-3">
        <div className="text-[15px] font-semibold text-ink">使用方式</div>
        <div className="mt-3 grid gap-2 xl:grid-cols-3">
          <div className="rounded-2xl border border-[#e4dbc9] bg-white px-3.5 py-3 text-sm leading-5 text-ink/70">
            <div className="font-semibold text-ink">长按模式</div>
            <div className="mt-1">按住开始录音，松开后自动停止并转录。</div>
          </div>
          <div className="rounded-2xl border border-[#e4dbc9] bg-white px-3.5 py-3 text-sm leading-5 text-ink/70">
            <div className="font-semibold text-ink">双击模式</div>
            <div className="mt-1">快速双击开始持续录音，再按一次停止。</div>
          </div>
          <div className="rounded-2xl border border-[#e4dbc9] bg-white px-3.5 py-3 text-sm leading-5 text-ink/70">
            <div className="font-semibold text-ink">取消录音</div>
            <div className="mt-1">录音过程中按 ESC，或点击悬浮录音窗取消。</div>
          </div>
        </div>
      </section>
    </div>
  );
}
