import { useEffect } from "react";
import { Layout } from "../components/Layout";
import { Toast } from "../components/Toast";
import { useBackendConnection } from "../hooks/useBackendConnection";
import { useHotkey } from "../hooks/useHotkey";
import { useTrayEvents } from "../hooks/useTrayEvents";
import { useAppStore } from "../stores/appStore";
import { EngineSettings } from "../pages/EngineSettings";
import { GeneralSettings } from "../pages/GeneralSettings";
import { HistoryPage } from "../pages/HistoryPage";
import { HotkeySettings } from "../pages/HotkeySettings";
import { RealtimeTranscriptionPage } from "../pages/RealtimeTranscriptionPage";
import { SpeakerSettings } from "../pages/SpeakerSettings";
import { VocabularySettings } from "../pages/VocabularySettings";
import { AgentPage } from "../pages/AgentPage";
import { primeOverlayBridge } from "../lib/overlayWindow";

const pageMap = {
  general: <GeneralSettings />,
  engine: <EngineSettings />,
  realtime: <RealtimeTranscriptionPage />,
  agent: <AgentPage />,
  history: <HistoryPage />,
  vocabulary: <VocabularySettings />,
  speaker: <SpeakerSettings />,
  hotkey: <HotkeySettings />,
} as const;

export function AppShell() {
  useBackendConnection();
  useHotkey();
  useTrayEvents();

  const page = useAppStore((state) => state.currentPage);
  const toast = useAppStore((state) => state.toast);
  const setToast = useAppStore((state) => state.setToast);
  const hydrateSettings = useAppStore((state) => state.hydrateSettings);
  const refreshHistory = useAppStore((state) => state.refreshHistory);

  useEffect(() => {
    primeOverlayBridge();
    void hydrateSettings();
    void refreshHistory().catch(() => {
      // History may not be available until backend is running.
    });
  }, [hydrateSettings, refreshHistory]);

  return (
    <>
      <Layout>{pageMap[page]}</Layout>
      <Toast message={toast} onClose={() => setToast(null)} />
    </>
  );
}
