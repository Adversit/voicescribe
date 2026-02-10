import { SettingsPanel } from "@/components/settings";
import { GlobalRecordingManager } from "@/components/GlobalRecordingManager";

export default function Home() {
  return (
    <>
      <GlobalRecordingManager />
      <div className="h-screen w-screen bg-background text-foreground">
        <SettingsPanel />
      </div>
    </>
  );
}
