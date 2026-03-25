import { useEffect } from "react";
import { useAppStore } from "../stores/appStore";

export function useBackendConnection() {
  const checkConnection = useAppStore((state) => state.checkConnection);
  const startBackend = useAppStore((state) => state.startBackend);
  const setToast = useAppStore((state) => state.setToast);

  useEffect(() => {
    let disposed = false;

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
