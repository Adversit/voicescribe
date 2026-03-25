import { RefreshCw, Server, Square } from "lucide-react";
import { useAppStore } from "../stores/appStore";

export function ConnectionStatus() {
  const backendConnected = useAppStore((state) => state.backendConnected);
  const runtime = useAppStore((state) => state.backendRuntime);
  const startBackend = useAppStore((state) => state.startBackend);
  const stopBackend = useAppStore((state) => state.stopBackend);
  const checkConnection = useAppStore((state) => state.checkConnection);

  return (
    <section className="rounded-[28px] border border-line/80 bg-panel/90 p-5">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3">
          <div className={`h-3 w-3 rounded-full ${backendConnected ? "bg-success" : "bg-accent"}`} />
          <div>
            <div className="text-sm font-semibold">{backendConnected ? "后端已连接" : "后端未连接"}</div>
            <div className="text-xs text-ink/55">
              {runtime ? `${runtime.status} / 端口 ${runtime.port}` : "等待桌面壳层回报运行时状态"}
            </div>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void checkConnection()}
            className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-2 text-sm text-ink/75"
          >
            <RefreshCw className="h-4 w-4" />
            刷新
          </button>
          <button
            type="button"
            onClick={() => void startBackend()}
            className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-2 text-sm text-white"
          >
            <Server className="h-4 w-4" />
            启动后端
          </button>
          <button
            type="button"
            onClick={() => void stopBackend()}
            className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-2 text-sm text-ink/75"
          >
            <Square className="h-4 w-4" />
            停止
          </button>
        </div>
      </div>

      {runtime ? (
        <div className="mt-4 grid gap-3 text-sm text-ink/70 md:grid-cols-3">
          <div className="rounded-2xl bg-canvas px-4 py-3">
            <div className="text-xs uppercase tracking-[0.16em] text-ink/45">Runtime</div>
            <div className="mt-1 break-all font-mono text-xs">{runtime.runtime_dir}</div>
          </div>
          <div className="rounded-2xl bg-canvas px-4 py-3">
            <div className="text-xs uppercase tracking-[0.16em] text-ink/45">Models</div>
            <div className="mt-1 break-all font-mono text-xs">{runtime.model_dir}</div>
          </div>
          <div className="rounded-2xl bg-canvas px-4 py-3">
            <div className="text-xs uppercase tracking-[0.16em] text-ink/45">Backend</div>
            <div className="mt-1 break-all font-mono text-xs">{runtime.backend_dir}</div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
