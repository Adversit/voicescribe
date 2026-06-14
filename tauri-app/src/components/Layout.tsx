import type { ReactNode } from "react";
import clsx from "clsx";
import { Bot, Cpu, History, Keyboard, PersonStanding, Radio, RefreshCw, Settings2, TextCursorInput } from "lucide-react";
import { useAppStore } from "../stores/appStore";

const items = [
  { key: "general", label: "通用", icon: Settings2 },
  { key: "engine", label: "引擎", icon: Cpu },
  { key: "realtime", label: "实时转录", icon: Radio },
  { key: "agent", label: "只读 Agent", icon: Bot },
  { key: "history", label: "历史记录", icon: History },
  { key: "vocabulary", label: "热词", icon: TextCursorInput },
  { key: "speaker", label: "说话人", icon: PersonStanding },
  { key: "hotkey", label: "快捷键", icon: Keyboard },
] as const;

export function Layout({ children }: { children: ReactNode }) {
  const page = useAppStore((state) => state.currentPage);
  const pipeline = useAppStore((state) => state.pipeline);
  const settings = useAppStore((state) => state.settings);
  const setPage = useAppStore((state) => state.setPage);
  const cycleStyleProfile = useAppStore((state) => state.cycleStyleProfile);
  const pipelineLabels = {
    idle: "待命",
    recording: "录音中",
    transcribing: "转录中",
    polishing: "润色中",
    outputting: "输出中",
    completed: "已完成",
    cancelled: "已取消",
    error: "处理失败",
  };
  const isActive = ["recording", "transcribing", "polishing", "outputting"].includes(pipeline.stage);
  const activeStyle = settings.styleProfiles.find((profile) => profile.id === settings.activeStyleProfileId) ?? null;
  const styleLabel = settings.styleProfiles.length === 0
    ? "未创建 Style"
    : activeStyle?.name ?? "内置 Profile";

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

          <div className="mt-auto px-3 pb-4">
            <button
              type="button"
              aria-label={`切换 Style，当前：${styleLabel}`}
              disabled={isActive || settings.styleProfiles.length === 0}
              onClick={cycleStyleProfile}
              className="sidebar-style-switch"
            >
              <span className="sidebar-style-switch-copy">
                <span className="sidebar-style-switch-label">当前 Style</span>
                <span className="sidebar-style-switch-value">{styleLabel}</span>
              </span>
              <RefreshCw className="h-3.5 w-3.5 shrink-0" />
            </button>
            <div
              aria-label={`处理状态：${pipelineLabels[pipeline.stage]}`}
              className="flex items-center gap-2 rounded-xl border border-[#ccb89d]/80 bg-[#fffaf3]/80 px-3 py-2.5 text-sm text-ink/75"
            >
              <span
                className={clsx(
                  "h-2 w-2 rounded-full",
                  isActive ? "animate-pulse bg-accent" : pipeline.stage === "error" ? "bg-red-600" : "bg-ink/30",
                )}
              />
              <span>{pipelineLabels[pipeline.stage]}</span>
            </div>
          </div>
        </aside>

        <main className="main-panel">{children}</main>
      </div>
    </div>
  );
}
