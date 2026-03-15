import type { RecordingRecord } from "../store/recording-store";

export type MeetingOutputFormat =
  | "text_only"
  | "with_speakers"
  | "with_summary"
  | "full";

function formatClock(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function shouldIncludeSpeakers(format: MeetingOutputFormat): boolean {
  return format === "with_speakers" || format === "full";
}

function shouldIncludeSummary(format: MeetingOutputFormat): boolean {
  return format === "with_summary" || format === "full";
}

export function exportRecordingAsText(
  record: RecordingRecord,
  format: MeetingOutputFormat = "full"
): string {
  const date = new Date(record.timestamp).toLocaleString("zh-CN");
  const lines: string[] = [];

  lines.push("转录记录");
  lines.push(`日期: ${date}`);
  lines.push(`时长: ${record.duration.toFixed(1)} 秒`);
  lines.push(`引擎: ${record.engine}`);
  if (record.model) lines.push(`模型: ${record.model}`);
  if (record.language) lines.push(`语言: ${record.language}`);
  lines.push(`模式: ${record.isStreaming ? "流式转录" : "文件上传"}`);
  lines.push("");

  if (shouldIncludeSummary(format) && record.summary) {
    lines.push("摘要");
    lines.push(record.summary.content);
    lines.push("");

    if (record.summary.decisions.length > 0) {
      lines.push("决策");
      record.summary.decisions.forEach((decision) => lines.push(`- ${decision}`));
      lines.push("");
    }

    if (record.summary.actionItems.length > 0) {
      lines.push("待办");
      record.summary.actionItems.forEach((item) =>
        lines.push(`- [ ] ${item.assignee}: ${item.task}`)
      );
      lines.push("");
    }
  }

  if (shouldIncludeSpeakers(format) && record.utterances && record.utterances.length > 0) {
    lines.push("转写记录");
    record.utterances.forEach((utterance) => {
      const start = formatClock(utterance.start);
      const end = formatClock(utterance.end);
      lines.push(`[${start} - ${end}] ${utterance.speaker}`);
      lines.push(utterance.text);
      lines.push("");
    });
  } else {
    lines.push("文本内容");
    lines.push(record.text);
    lines.push("");

    if (!record.isStreaming && record.segments.length > 0) {
      lines.push("分段内容");
      record.segments.forEach((segment, index) => {
        const speaker = segment.speaker ? ` (${segment.speaker})` : "";
        lines.push(
          `${index + 1}. [${segment.start.toFixed(1)}s - ${segment.end.toFixed(
            1
          )}s]${speaker}: ${segment.text}`
        );
      });
      lines.push("");
    }
  }

  return lines.join("\n").trim();
}

export function exportRecordingAsMarkdown(
  record: RecordingRecord,
  format: MeetingOutputFormat = "full"
): string {
  const date = new Date(record.timestamp).toLocaleString("zh-CN");
  const lines: string[] = [];

  lines.push(`# 转录记录 ${date}`);
  lines.push("");
  lines.push(`- 时长: ${record.duration.toFixed(1)} 秒`);
  lines.push(`- 引擎: ${record.engine}`);
  if (record.model) lines.push(`- 模型: ${record.model}`);
  if (record.language) lines.push(`- 语言: ${record.language}`);
  lines.push(`- 模式: ${record.isStreaming ? "流式转录" : "文件上传"}`);
  lines.push("");

  if (shouldIncludeSummary(format) && record.summary) {
    lines.push("## 摘要");
    lines.push(record.summary.content);
    lines.push("");

    if (record.summary.decisions.length > 0) {
      lines.push("## 决策");
      record.summary.decisions.forEach((decision) => lines.push(`- ${decision}`));
      lines.push("");
    }

    if (record.summary.actionItems.length > 0) {
      lines.push("## 待办");
      record.summary.actionItems.forEach((item) =>
        lines.push(`- [ ] ${item.assignee}: ${item.task}`)
      );
      lines.push("");
    }
  }

  if (shouldIncludeSpeakers(format) && record.utterances && record.utterances.length > 0) {
    lines.push("## 转写记录");
    lines.push("");
    record.utterances.forEach((utterance) => {
      const start = formatClock(utterance.start);
      const end = formatClock(utterance.end);
      lines.push(`**${utterance.speaker}** [${start} - ${end}]`);
      lines.push(utterance.text);
      lines.push("");
    });
  } else {
    lines.push("## 文本内容");
    lines.push(record.text);
    lines.push("");

    if (!record.isStreaming && record.segments.length > 0) {
      lines.push("## 分段内容");
      record.segments.forEach((segment, index) => {
        const speaker = segment.speaker ? ` (${segment.speaker})` : "";
        lines.push(
          `${index + 1}. [${segment.start.toFixed(1)}s - ${segment.end.toFixed(
            1
          )}s]${speaker}: ${segment.text}`
        );
      });
      lines.push("");
    }
  }

  return lines.join("\n").trim();
}
