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
    <div className="min-h-screen bg-[linear-gradient(180deg,#f4efe6_0%,#eee7da_100%)] px-4 py-6 text-ink sm:px-6">
      <div className="mx-auto max-w-[920px] rounded-[32px] border border-[#d7c9b4] bg-[#fbf8f2]/96 p-4 shadow-[0_28px_80px_rgba(56,36,20,0.14)] backdrop-blur sm:p-5">
        <div className="rounded-[26px] border border-[#e1d6c4] bg-white/88 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] sm:p-5">
          <ShellHeader />

          <section className="mt-4 rounded-[22px] border border-[#e4dbc9] bg-[#f7f2e8] p-2.5">
            <div className="flex flex-wrap gap-2">
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setPage(item.key)}
                    className={clsx(
                      "inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm transition",
                      page === item.key
                        ? "bg-white text-ink shadow-[0_8px_24px_rgba(75,48,28,0.12)]"
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

          <main className="mt-4 min-h-[560px] rounded-[24px] border border-[#e4dbc9] bg-white px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] sm:px-6 sm:py-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
