import { SettingsPanel } from "@/components/settings";
import { GlobalRecordingManager } from "@/components/GlobalRecordingManager";
import { AskAnswerPanel } from "@/components/AskAnswerPanel";
import { OperationNoticeBanner } from "@/components/OperationNoticeBanner";

export default function Home() {
  return (
    <>
      <GlobalRecordingManager />
      <OperationNoticeBanner />
      <AskAnswerPanel />
      <div className="h-screen w-screen bg-background text-foreground">
        <SettingsPanel />
      </div>
    </>
  );
}
