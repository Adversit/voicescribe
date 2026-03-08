"use client";

import type { MeetingSummary } from "../../store/meeting-store";

interface SummaryCardProps {
  summary: MeetingSummary | null;
  isRecording: boolean;
}

export function SummaryCard({ summary, isRecording }: SummaryCardProps) {
  if (!summary && isRecording) {
    return (
      <div className="border-t p-4 text-muted-foreground text-sm">
        摘要将在录制 2-3 分钟后自动生成...
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="border-t p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">实时摘要</h3>
        {summary.updatedAt && (
          <span className="text-xs text-muted-foreground">
            更新于 {new Date(summary.updatedAt).toLocaleTimeString("zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </div>
      <p className="text-sm text-foreground">{summary.content}</p>
      {summary.decisions.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-1">决策</h4>
          <ul className="text-sm text-foreground list-disc list-inside">
            {summary.decisions.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </div>
      )}
      {summary.actionItems.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-1">待办</h4>
          <ul className="text-sm text-foreground list-disc list-inside">
            {summary.actionItems.map((a, i) => (
              <li key={i}>
                <span className="text-blue-400">{a.assignee}</span>：{a.task}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
