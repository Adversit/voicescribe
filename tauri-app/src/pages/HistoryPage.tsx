import { useEffect, useMemo, useState } from "react";
import * as backendApi from "../api/backend";
import { copyText } from "../lib/clipboard";
import { useAppStore } from "../stores/appStore";
import { SettingsPage, SettingsSection, dangerButtonClassName, primaryButtonClassName, secondaryButtonClassName } from "../components/settings-ui";
import type { HistoryMode } from "../types";

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export function HistoryPage() {
  const historyRecords = useAppStore((state) => state.historyRecords);
  const selectedHistoryId = useAppStore((state) => state.selectedHistoryId);
  const refreshHistory = useAppStore((state) => state.refreshHistory);
  const selectHistoryRecord = useAppStore((state) => state.selectHistoryRecord);
  const deleteHistoryRecord = useAppStore((state) => state.deleteHistoryRecord);
  const clearHistoryRecords = useAppStore((state) => state.clearHistoryRecords);
  const setToast = useAppStore((state) => state.setToast);
  const backendConnected = useAppStore((state) => state.backendConnected);
  const [filter, setFilter] = useState<"all" | HistoryMode>("all");

  useEffect(() => {
    if (!backendConnected) {
      return;
    }

    void refreshHistory().catch((error) => {
      setToast(error instanceof Error ? error.message : "加载历史记录失败");
    });
  }, [backendConnected, refreshHistory, setToast]);

  const filteredRecords = useMemo(() => {
    if (filter === "all") {
      return historyRecords;
    }
    return historyRecords.filter((record) => record.mode === filter);
  }, [filter, historyRecords]);

  const selectedRecord = filteredRecords.find((record) => record.id === selectedHistoryId) ?? filteredRecords[0] ?? null;

  return (
    <SettingsPage
      title="历史记录"
      description="按整次转录任务管理流式与非流式结果，支持复制、下载、删除和清空。"
    >
      <SettingsSection
        title="记录列表"
        description="自动记录流式与非流式结果，列表仅保留任务级记录。"
        actions={
          <>
            <span className="app-chip">{filteredRecords.length} 条记录</span>
            <button type="button" className={dangerButtonClassName} onClick={() => void clearHistoryRecords()}>
              清空全部
            </button>
          </>
        }
      >
        <div className="mb-3 flex flex-wrap gap-2">
          {([
            ["all", "全部"],
            ["stream", "流式"],
            ["non-stream", "非流式"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={value === filter ? primaryButtonClassName : secondaryButtonClassName}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="list-scroll space-y-2">
            {filteredRecords.length === 0 ? (
              <div className="rounded-[12px] border border-dashed border-line bg-panel px-4 py-3 text-sm text-ink/55">
                当前还没有历史记录。
              </div>
            ) : (
              filteredRecords.map((record) => (
                <button
                  key={record.id}
                  type="button"
                  onClick={() => selectHistoryRecord(record.id)}
                  className={`w-full rounded-[12px] border px-4 py-3 text-left transition ${selectedRecord?.id === record.id ? "border-line-strong bg-panel" : "border-line bg-[#fff8ef] hover:bg-panel"}`}
                >
                  <div className="flex items-center justify-between gap-3 text-xs text-ink/46">
                    <span>{record.mode === "stream" ? "流式" : "非流式"}</span>
                    <span>{formatDate(record.created_at)}</span>
                  </div>
                  <div className="mt-2 line-clamp-2 text-sm leading-6 text-ink">{record.text}</div>
                </button>
              ))
            )}
          </div>

          <div className="rounded-[12px] border border-line bg-panel px-4 py-4">
            {selectedRecord ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-ink/46">
                  <span className="app-chip">{selectedRecord.mode === "stream" ? "流式" : "非流式"}</span>
                  <span className="app-chip">{selectedRecord.asr_engine ?? selectedRecord.engine}</span>
                  <span className="app-chip">{selectedRecord.asr_model ?? selectedRecord.model}</span>
                  <span className="app-chip">{selectedRecord.text_processing.profile}</span>
                  <span className="app-chip">{selectedRecord.text_processing.status}</span>
                  {selectedRecord.diarization_model ? <span className="app-chip">{selectedRecord.diarization_model}</span> : null}
                  {selectedRecord.speaker_mapping_model ? <span className="app-chip">{selectedRecord.speaker_mapping_model}</span> : null}
                  <span className="app-chip">{formatDate(selectedRecord.created_at)}</span>
                </div>

                <div>
                  <div className="text-xs text-ink/46">最终文本</div>
                  <div className="mt-1 text-sm leading-6 text-ink">{selectedRecord.text}</div>
                </div>

                {selectedRecord.raw_text !== selectedRecord.text ? (
                  <div>
                    <div className="text-xs text-ink/46">原始转写</div>
                    <div className="mt-1 text-sm leading-6 text-ink">{selectedRecord.raw_text}</div>
                  </div>
                ) : null}

                {selectedRecord.text_processing.warning ? (
                  <div className="rounded-[10px] border border-line bg-[#fff8ef] px-3 py-2 text-sm text-ink">
                    {selectedRecord.text_processing.warning}
                  </div>
                ) : null}

                {selectedRecord.summary ? (
                  <div>
                    <div className="text-xs text-ink/46">AI 摘要</div>
                    <div className="mt-1 text-sm leading-6 text-ink">{selectedRecord.summary}</div>
                  </div>
                ) : null}

                {selectedRecord.speaker_entries.length > 0 ? (
                  <div>
                    <div className="text-xs text-ink/46">说话人片段</div>
                    <div className="mt-2 space-y-2">
                      {selectedRecord.speaker_entries.map((entry, index) => (
                        <div key={`${selectedRecord.id}-${index}`} className="rounded-[10px] border border-line bg-[#fff8ef] px-3 py-2">
                          <div className="flex items-center justify-between gap-3 text-xs text-ink/46">
                            <span>{entry.speaker ?? "说话人"}</span>
                            <span>{entry.timestamp ?? "--:--:--"}</span>
                          </div>
                          <div className="mt-1 text-sm leading-6 text-ink">{entry.text}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={secondaryButtonClassName}
                    onClick={() =>
                      void copyText(selectedRecord.text)
                        .then(() => setToast("已复制历史记录文本"))
                        .catch((error) => setToast(error instanceof Error ? error.message : "复制失败"))
                    }
                  >
                    复制文本
                  </button>
                  <button
                    type="button"
                    className={secondaryButtonClassName}
                    onClick={() =>
                      void backendApi
                        .downloadHistoryText(selectedRecord.id)
                        .then(() => setToast("文本已开始下载"))
                        .catch((error) => setToast(error instanceof Error ? error.message : "下载文本失败"))
                    }
                  >
                    下载文本
                  </button>
                  <button
                    type="button"
                    className={secondaryButtonClassName}
                    disabled={!selectedRecord.retain_audio || !selectedRecord.audio_path}
                    onClick={() =>
                      void backendApi
                        .downloadHistoryAudio(selectedRecord.id)
                        .then(() => setToast("音频已开始下载"))
                        .catch((error) => setToast(error instanceof Error ? error.message : "下载音频失败"))
                    }
                  >
                    下载音频
                  </button>
                  <button
                    type="button"
                    className={dangerButtonClassName}
                    onClick={() => void deleteHistoryRecord(selectedRecord.id)}
                  >
                    删除记录
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-ink/55">请选择一条历史记录查看详情。</div>
            )}
          </div>
        </div>
      </SettingsSection>
    </SettingsPage>
  );
}
