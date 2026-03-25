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

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Hotkey</p>
        <h1 className="text-3xl font-semibold">快捷键</h1>
        <p className="max-w-3xl text-sm leading-6 text-ink/65">
          当前先落配置存储与 Tauri 命令接口。系统级长按/双击监听的 Win32 实现会在下一轮接入这个状态层。
        </p>
      </header>

      <section className="rounded-[28px] border border-line bg-panel/90 p-5">
        <div className="text-sm text-ink/55">当前显示</div>
        <div className="mt-2 text-2xl font-semibold">{display}</div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {modifiers.map((modifier) => (
            <label
              key={modifier.key}
              className="flex items-center justify-between rounded-2xl border border-line bg-white/70 px-4 py-3"
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

        <div className="mt-5">
          <label className="block text-sm font-medium">主键（Virtual Key Code）</label>
          <input
            type="number"
            value={settings.hotkeyKeyCode}
            onChange={(event) =>
              updateSettings({ hotkeyKeyCode: Number(event.target.value) || 0 })
            }
            className="mt-2 w-full max-w-xs rounded-2xl border border-line bg-white px-4 py-3"
          />
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
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
            className="rounded-full bg-accent px-4 py-2 text-white"
          >
            应用
          </button>
        </div>
      </section>
    </div>
  );
}
