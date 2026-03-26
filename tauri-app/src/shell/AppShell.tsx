import { useEffect } from "react";
import { Layout } from "../components/Layout";
import { Toast } from "../components/Toast";
import { useBackendConnection } from "../hooks/useBackendConnection";
import { useHotkey } from "../hooks/useHotkey";
import { useAppStore } from "../stores/appStore";
import { EngineSettings } from "../pages/EngineSettings";
import { GeneralSettings } from "../pages/GeneralSettings";
import { HotkeySettings } from "../pages/HotkeySettings";
import { SpeakerSettings } from "../pages/SpeakerSettings";
import { VocabularySettings } from "../pages/VocabularySettings";

const pageMap = {
  general: <GeneralSettings />,
  engine: <EngineSettings />,
  vocabulary: <VocabularySettings />,
  speaker: <SpeakerSettings />,
  hotkey: <HotkeySettings />,
} as const;

export function AppShell() {
  useBackendConnection();
  useHotkey();

  const page = useAppStore((state) => state.currentPage);
  const toast = useAppStore((state) => state.toast);
  const setToast = useAppStore((state) => state.setToast);
  const hydrateSettings = useAppStore((state) => state.hydrateSettings);

  useEffect(() => {
    void hydrateSettings();
  }, [hydrateSettings]);

  return (
    <>
      <Layout>{pageMap[page]}</Layout>
      <Toast message={toast} onClose={() => setToast(null)} />
    </>
  );
}
