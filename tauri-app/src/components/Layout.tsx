import type { ReactNode } from "react";
import clsx from "clsx";
import {
  AppWindow,
  Cpu,
  Keyboard,
  PersonStanding,
  Sparkles,
  TextCursorInput,
} from "lucide-react";
import { useAppStore } from "../stores/appStore";

const items = [
  { key: "general", label: "通用", icon: Sparkles },
  { key: "engine", label: "引擎", icon: Cpu },
  { key: "vocabulary", label: "热词", icon: TextCursorInput },
  { key: "speaker", label: "说话人", icon: PersonStanding },
  { key: "hotkey", label: "快捷键", icon: Keyboard },
] as const;

export function Layout({ children }: { children: ReactNode }) {
  const page = useAppStore((state) => state.currentPage);
  const setPage = useAppStore((state) => state.setPage);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(193,75,31,0.15),_transparent_35%),linear-gradient(180deg,#f8f1e4_0%,#f6f2eb_100%)] text-ink">
      <div className="mx-auto flex min-h-screen max-w-7xl gap-6 px-4 py-6 sm:px-6">
        <aside className="flex w-full max-w-[260px] flex-col rounded-[28px] border border-line/80 bg-panel/90 p-5 shadow-panel">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-white">
              <AppWindow className="h-5 w-5" />
            </div>
            <div>
              <div className="text-lg font-semibold">VoiceScribe</div>
              <div className="text-xs uppercase tracking-[0.22em] text-ink/55">
                Windows Shell
              </div>
            </div>
          </div>

          <nav className="space-y-2">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setPage(item.key)}
                  className={clsx(
                    "flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm transition",
                    page === item.key
                      ? "bg-accent text-white shadow-lg shadow-accent/20"
                      : "bg-transparent text-ink/75 hover:bg-accentSoft/70 hover:text-ink",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="mt-auto rounded-3xl border border-line/70 bg-canvas/80 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-ink/50">Build Scope</p>
            <p className="mt-2 text-sm text-ink/80">
              安装包不内置模型；模型由系统既有下载逻辑在运行时获取。
            </p>
          </div>
        </aside>

        <main className="flex-1 rounded-[32px] border border-line/80 bg-white/75 p-6 shadow-panel backdrop-blur">
          {children}
        </main>
      </div>
    </div>
  );
}
