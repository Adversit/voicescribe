import { RefreshCw, Server, Square } from "lucide-react";
import { useAppStore } from "../stores/appStore";

function compactPath(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  if (value.length <= 42) {
    return value;
  }

  return `${value.slice(0, 18)}...${value.slice(-18)}`;
}

export function ConnectionStatus() {
  const backendConnected = useAppStore((state) => state.backendConnected);
  const runtime = useAppStore((state) => state.backendRuntime);
  const startBackend = useAppStore((state) => state.startBackend);
  const stopBackend = useAppStore((state) => state.stopBackend);
  const checkConnection = useAppStore((state) => state.checkConnection);

  return (
    <section className="rounded-[18px] border border-[#e4dbc9] bg-[#faf6ef] px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-[180px] items-center gap-3">
          <div className={`h-2.5 w-2.5 rounded-full ${backendConnected ? "bg-success" : "bg-accent"}`} />
          <div>
            <div className="text-sm font-semibold text-ink">
              {backendConnected ? "后端已连接" : "后端未连接"}
            </div>
            <div className="text-xs text-ink/55">
              {runtime ? `${runtime.status} / 端口 ${runtime.port}` : "等待桌面壳层回报运行时状态"}
            </div>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void checkConnection()}
            className="inline-flex items-center gap-2 rounded-full border border-[#ddd2c0] bg-white px-3 py-1.5 text-sm text-ink/75"
          >
            <RefreshCw className="h-4 w-4" />
            刷新
          </button>
          <button
            type="button"
            onClick={() => void startBackend()}
            className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1.5 text-sm text-white"
          >
            <Server className="h-4 w-4" />
            启动后端
          </button>
          <button
            type="button"
            onClick={() => void stopBackend()}
            className="inline-flex items-center gap-2 rounded-full border border-[#ddd2c0] bg-white px-3 py-1.5 text-sm text-ink/75"
          >
            <Square className="h-4 w-4" />
            停止
          </button>
        </div>
      </div>

      {runtime ? (
        <div className="mt-3 grid gap-2 text-xs text-ink/65 md:grid-cols-3">
          <div className="rounded-2xl border border-[#e4dbc9] bg-white px-3 py-2.5">
            <div className="text-[11px] uppercase tracking-[0.14em] text-ink/42">Runtime</div>
            <div className="mt-1 truncate font-mono">{compactPath(runtime.runtime_dir)}</div>
          </div>
          <div className="rounded-2xl border border-[#e4dbc9] bg-white px-3 py-2.5">
            <div className="text-[11px] uppercase tracking-[0.14em] text-ink/42">Models</div>
            <div className="mt-1 truncate font-mono">{compactPath(runtime.model_dir)}</div>
          </div>
          <div className="rounded-2xl border border-[#e4dbc9] bg-white px-3 py-2.5">
            <div className="text-[11px] uppercase tracking-[0.14em] text-ink/42">Backend</div>
            <div className="mt-1 truncate font-mono">{compactPath(runtime.backend_dir)}</div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
