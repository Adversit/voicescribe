import type { ReactNode } from "react";
import clsx from "clsx";
import { Cpu, Keyboard, PersonStanding, Settings2, TextCursorInput } from "lucide-react";
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
    <div className="min-h-screen bg-[linear-gradient(180deg,#f4efe6_0%,#eee7da_100%)] px-2 py-2 text-ink sm:px-3 sm:py-3">
      <div className="mx-auto max-w-[944px] overflow-hidden rounded-[24px] border border-[#d9ccb7] bg-[#f6efe2] shadow-[0_18px_48px_rgba(56,36,20,0.14)]">
        <div className="flex min-h-[648px] flex-col lg:flex-row">
          <aside className="border-b border-[#e0d4c1] bg-[#f1e6d5] lg:min-h-[648px] lg:w-[208px] lg:border-b-0 lg:border-r">
            <div className="px-4 pb-4 pt-4">
              <div className="text-[30px] font-semibold leading-none text-ink">VoiceScribe</div>
              <div className="mt-2 text-sm text-ink/56">设置</div>
            </div>

            <nav className="px-3 pb-3">
              <div className="space-y-1.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setPage(item.key)}
                      className={clsx(
                        "flex w-full items-center gap-3 rounded-[18px] px-4 py-3 text-left text-[15px] transition",
                        page === item.key
                          ? "bg-white text-ink shadow-[0_8px_22px_rgba(75,48,28,0.10)]"
                          : "text-ink/70 hover:bg-white/72 hover:text-ink",
                      )}
                    >
                      <span
                        className={clsx(
                          "flex h-8 w-8 items-center justify-center rounded-xl border transition",
                          page === item.key
                            ? "border-[#d8c5ab] bg-[#fff9f0] text-accent"
                            : "border-transparent bg-white/55 text-ink/55",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </nav>

            <div className="hidden px-4 pb-4 pt-5 lg:block">
              <div className="rounded-[18px] border border-[#deceb7] bg-white/72 px-4 py-3 text-xs text-ink/52">
                <div className="font-medium text-ink/64">VoiceScribe</div>
                <div className="mt-1">v0.2.0 Windows Preview</div>
              </div>
            </div>
          </aside>

          <main className="min-h-[648px] flex-1 bg-white px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] sm:px-6 sm:py-5">
            {children}
          </main>
        </div>

        <footer className="border-t border-[#e0d4c1] bg-[#f1e6d5] px-4 py-2.5 text-sm text-ink/56 lg:hidden">
          VoiceScribe v0.2.0
        </footer>
      </div>
    </div>
  );
}
