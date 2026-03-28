import { SettingsPage, SettingsSection } from "../components/settings-ui";
import { useAppStore } from "../stores/appStore";

function formatTime(value: string | null) {
  if (!value) {
    return "--:--:--";
  }
  return value;
}

export function RealtimeTranscriptionPage() {
  const realtime = useAppStore((state) => state.realtime);
  const enableStreaming = useAppStore((state) => state.settings.enableStreaming);

  return (
    <SettingsPage
      title="实时转录"
      description="按说话人时间线展示流式转录片段。片段在说话人一段话结束并转录成功后落地显示。"
    >
      <SettingsSection title="当前状态" description="流式能力由通用页控制，不在这里单独开始或停止。">
        <div className="flex flex-wrap items-center gap-3 text-sm text-ink/70">
          <span className="app-chip">流式传输：{enableStreaming ? "已启用" : "未启用"}</span>
          <span className="app-chip">会话状态：{realtime.status}</span>
          {realtime.error ? <span className="app-chip">错误：{realtime.error}</span> : null}
        </div>
      </SettingsSection>

      <SettingsSection title="AI 摘要" description="仅在启用 AI 摘要总结后出现。">
        <div className="list-scroll space-y-2">
          {realtime.summaries.length === 0 ? (
            <div className="rounded-[12px] border border-dashed border-line bg-panel px-4 py-3 text-sm text-ink/55">
              当前还没有摘要结果。
            </div>
          ) : (
            realtime.summaries.map((summary) => (
              <div key={summary.id} className="rounded-[12px] border border-line bg-panel px-4 py-3">
                <div className="text-xs text-ink/46">{new Date(summary.createdAt).toLocaleString()}</div>
                <div className="mt-1 text-sm leading-6 text-ink">{summary.text}</div>
              </div>
            ))
          )}
        </div>
      </SettingsSection>

      <SettingsSection title="实时片段" description="按时间线展示已收敛的说话人片段，不做逐字抖动效果。">
        <div className="list-scroll space-y-2">
          {realtime.entries.length === 0 ? (
            <div className="rounded-[12px] border border-dashed border-line bg-panel px-4 py-3 text-sm text-ink/55">
              {enableStreaming ? "开始录音后，这里会出现按说话人落地的实时片段。" : "请先在通用页启用流式传输。"}
            </div>
          ) : (
            realtime.entries.map((entry) => (
              <div key={entry.id} className="rounded-[12px] border border-line bg-panel px-4 py-3">
                <div className="flex items-center justify-between gap-3 text-xs text-ink/46">
                  <span>{entry.speaker ?? "说话人"}</span>
                  <span>{formatTime(entry.timestamp)}</span>
                </div>
                <div className="mt-1 text-sm leading-6 text-ink">{entry.text}</div>
              </div>
            ))
          )}
        </div>
      </SettingsSection>
    </SettingsPage>
  );
}
