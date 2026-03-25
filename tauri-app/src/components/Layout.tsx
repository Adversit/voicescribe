import type { ReactNode } from "react";
import clsx from "clsx";
import { Cpu, Keyboard, PersonStanding, Settings2, TextCursorInput } from "lucide-react";
import { ShellHeader } from "./ShellHeader";
import { useAppStore } from "../stores/appStore";

const items = [
  { key: "general", label: "通用", icon: Settings2 },
  { key: "engine", label: "引擎", icon: Cpu },
  { key: "vocabulary", label: "词汇", icon: TextCursorInput },
  { key: "speaker", label: "说话人", icon: PersonStanding },
  { key: "hotkey", label: "快捷键", icon: Keyboard },
] as const;

export function Layout({ children }: { children: ReactNode }) {
  const page = useAppStore((state) => state.currentPage);
  const setPage = useAppStore((state) => state.setPage);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(193,75,31,0.12),_transparent_32%),linear-gradient(180deg,#f7f0e2_0%,#f4efe7_100%)] px-4 py-6 text-ink sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-5xl flex-col gap-5">
        <ShellHeader />

        <section className="rounded-[28px] border border-line/80 bg-panel/88 p-3 shadow-panel backdrop-blur">
          <div className="flex flex-wrap gap-2">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setPage(item.key)}
                  className={clsx(
                    "inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm transition",
                    page === item.key
                      ? "bg-accent text-white shadow-lg shadow-accent/20"
                      : "text-ink/70 hover:bg-white/70 hover:text-ink",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        <main className="flex-1 rounded-[30px] border border-line/80 bg-white/78 p-6 shadow-panel backdrop-blur sm:p-7">
          {children}
        </main>
      </div>
    </div>
  );
}
