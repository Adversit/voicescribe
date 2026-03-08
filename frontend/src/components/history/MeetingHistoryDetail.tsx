"use client";

import { useState } from "react";
import type { MeetingRecord } from "../../store/meeting-store";
import { useMeetingStore } from "../../store/meeting-store";
import { exportMeetingAsMarkdown } from "../../lib/export-meeting";
import { SpeakerFilter } from "./SpeakerFilter";
import { Copy, FileDown, Trash2, ArrowLeft } from "lucide-react";

const SPEAKER_COLORS = [
  "text-blue-400",
  "text-green-400",
  "text-yellow-400",
  "text-purple-400",
  "text-pink-400",
  "text-cyan-400",
  "text-orange-400",
  "text-red-400",
];

interface MeetingHistoryDetailProps {
  record: MeetingRecord;
  onBack: () => void;
}

export function MeetingHistoryDetail({ record, onBack }: MeetingHistoryDetailProps) {
  const [selectedSpeaker, setSelectedSpeaker] = useState<string | null>(null);
  const deleteMeetingRecord = useMeetingStore((s) => s.deleteMeetingRecord);

  const speakerColorMap = new Map<string, string>();
  function getSpeakerColor(speaker: string): string {
    if (!speakerColorMap.has(speaker)) {
      const idx = speakerColorMap.size % SPEAKER_COLORS.length;
      speakerColorMap.set(speaker, SPEAKER_COLORS[idx]);
    }
    return speakerColorMap.get(speaker)!;
  }

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  const filteredUtterances = selectedSpeaker
    ? record.utterances.filter((u) => u.speaker === selectedSpeaker)
    : record.utterances;

  const handleCopy = async () => {
    const text = record.utterances
      .map((u) => `[${u.speaker}] ${u.text}`)
      .join("\n");
    await navigator.clipboard.writeText(text);
  };

  const handleExportMd = async () => {
    const md = exportMeetingAsMarkdown(record);
    await navigator.clipboard.writeText(md);
  };

  const handleDelete = () => {
    deleteMeetingRecord(record.id);
    onBack();
  };

  const date = new Date(record.timestamp).toLocaleString("zh-CN");
  const durationMin = Math.floor(record.duration / 60);
  const durationSec = Math.floor(record.duration % 60);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h3 className="text-sm font-medium">{date}</h3>
            <p className="text-xs text-muted-foreground">
              {durationMin}分{durationSec}秒 · {record.utterances.length} 条发言 · {record.engine}
            </p>
          </div>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={handleCopy}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
            title="复制文本"
          >
            <Copy className="h-4 w-4" />
          </button>
          <button
            onClick={handleExportMd}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
            title="导出 Markdown"
          >
            <FileDown className="h-4 w-4" />
          </button>
          <button
            onClick={handleDelete}
            className="p-1.5 rounded-md hover:bg-muted text-red-400 hover:text-red-300"
            title="删除"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Speaker filter */}
      <SpeakerFilter
        utterances={record.utterances}
        selectedSpeaker={selectedSpeaker}
        onSelect={setSelectedSpeaker}
      />

      {/* Utterances */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filteredUtterances.map((u) => (
          <div key={u.id}>
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className={`font-medium text-sm ${getSpeakerColor(u.speaker)}`}>
                {u.speaker}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatTime(u.start)}
              </span>
            </div>
            <p className="text-sm text-foreground pl-0.5">{u.text}</p>
          </div>
        ))}
      </div>

      {/* Summary */}
      {record.summary && (
        <div className="border-t p-4 space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">摘要</h3>
          <p className="text-sm text-foreground">{record.summary.content}</p>
          {record.summary.decisions.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-1">决策</h4>
              <ul className="text-sm list-disc list-inside">
                {record.summary.decisions.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}
          {record.summary.actionItems.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-1">待办</h4>
              <ul className="text-sm list-disc list-inside">
                {record.summary.actionItems.map((a, i) => (
                  <li key={i}>
                    <span className="text-blue-400">{a.assignee}</span>：{a.task}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
