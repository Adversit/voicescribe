import { RefreshCw, Server, Square } from "lucide-react";
import { useAppStore } from "../stores/appStore";
import {
  SettingsRow,
  primaryButtonClassName,
  secondaryButtonClassName,
} from "./settings-ui";

function compactPath(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  if (value.length <= 38) {
    return value;
  }

  return `${value.slice(0, 16)}...${value.slice(-16)}`;
}

export function ConnectionStatus() {
  const backendConnected = useAppStore((state) => state.backendConnected);
  const runtime = useAppStore((state) => state.backendRuntime);
  const startBackend = useAppStore((state) => state.startBackend);
  const stopBackend = useAppStore((state) => state.stopBackend);
  const checkConnection = useAppStore((state) => state.checkConnection);

  return (
    <div>
      <SettingsRow
        title={backendConnected ? "后端已连接" : "后端未连接"}
        description={runtime ? `${runtime.status} / 端口 ${runtime.port}` : "等待桌面端回报运行时状态"}
        control={
          <span className="app-chip">
            <span className={`h-2.5 w-2.5 rounded-full ${backendConnected ? "bg-success" : "bg-accent"}`} />
            {backendConnected ? "在线" : "离线"}
          </span>
        }
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => void checkConnection()} className={secondaryButtonClassName}>
          <RefreshCw className="h-4 w-4" />
          刷新
        </button>
        <button type="button" onClick={() => void startBackend()} className={primaryButtonClassName}>
          <Server className="h-4 w-4" />
          启动后端
        </button>
        <button type="button" onClick={() => void stopBackend()} className={secondaryButtonClassName}>
          <Square className="h-4 w-4" />
          停止
        </button>
      </div>

      {runtime ? (
        <div className="runtime-grid">
          <div className="runtime-card">
            <div className="runtime-card-label">Runtime</div>
            <div className="runtime-card-value">{compactPath(runtime.runtime_dir)}</div>
          </div>
          <div className="runtime-card">
            <div className="runtime-card-label">Models</div>
            <div className="runtime-card-value">{compactPath(runtime.model_dir)}</div>
          </div>
          <div className="runtime-card">
            <div className="runtime-card-label">Backend</div>
            <div className="runtime-card-value">{compactPath(runtime.backend_dir)}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}