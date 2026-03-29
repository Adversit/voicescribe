import { useEffect } from "react";
import { useAppStore } from "../stores/appStore";

const BACKEND_READY_TIMEOUT_MS = 15000;
const BACKEND_READY_POLL_MS = 500;

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function useBackendConnection() {
  const checkConnection = useAppStore((state) => state.checkConnection);
  const startBackend = useAppStore((state) => state.startBackend);
  const setToast = useAppStore((state) => state.setToast);

  useEffect(() => {
    let disposed = false;

    const waitForBackendReady = async () => {
      const deadline = Date.now() + BACKEND_READY_TIMEOUT_MS;
      while (!disposed && Date.now() < deadline) {
        await checkConnection().catch(() => undefined);
        if (useAppStore.getState().backendConnected) {
          return true;
        }
        await sleep(BACKEND_READY_POLL_MS);
      }
      return false;
    };

    const bootstrap = async () => {
      try {
        await checkConnection();
      } catch {
        // Ignore initial bootstrap errors.
      }

      if (disposed) {
        return;
      }

      const connected = useAppStore.getState().backendConnected;
      if (!connected) {
        try {
          await startBackend();
          const ready = await waitForBackendReady();
          if (!ready && !disposed) {
            setToast("后端启动中，请稍后再试");
          }
        } catch (error) {
          setToast(
            error instanceof Error ? error.message : "后端启动失败，请检查 Python 环境",
          );
        }
      }
    };

    void bootstrap();

    const timer = window.setInterval(() => {
      void checkConnection();
    }, 10_000);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [checkConnection, setToast, startBackend]);
}
