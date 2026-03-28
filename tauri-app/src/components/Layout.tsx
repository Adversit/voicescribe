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
    <div className="window-root">
      <div className="window-frame">
        <aside className="sidebar-panel">
          <div className="sidebar-brand">
            <div className="sidebar-brand-title">VoiceScribe</div>
            <div className="sidebar-brand-subtitle">设置</div>
          </div>

          <nav className="sidebar-nav" aria-label="设置导航">
            {items.map((item) => {
              const Icon = item.icon;
              const active = page === item.key;

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setPage(item.key)}
                  className={clsx("sidebar-nav-item", active && "is-active")}
                >
                  <span className="sidebar-nav-icon">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="main-panel">{children}</main>
      </div>
    </div>
  );
}