import type { MeetingRecord } from "../store/meeting-store";

export function exportMeetingAsMarkdown(record: MeetingRecord): string {
  const date = new Date(record.timestamp).toLocaleString("zh-CN");
  const lines: string[] = [];

  lines.push(`# 会议记录 ${date}`);
  lines.push("");

  if (record.summary) {
    lines.push("## 摘要");
    lines.push(record.summary.content);
    lines.push("");

    if (record.summary.decisions.length > 0) {
      lines.push("## 决策");
      record.summary.decisions.forEach((d) => lines.push(`- ${d}`));
      lines.push("");
    }

    if (record.summary.actionItems.length > 0) {
      lines.push("## 待办");
      record.summary.actionItems.forEach((a) =>
        lines.push(`- [ ] ${a.assignee}：${a.task}`)
      );
      lines.push("");
    }
  }

  lines.push("## 转写记录");
  lines.push("");

  record.utterances.forEach((u) => {
    const time = `${Math.floor(u.start / 60)}:${Math.floor(u.start % 60).toString().padStart(2, "0")}`;
    lines.push(`**${u.speaker}** (${time})`);
    lines.push(u.text);
    lines.push("");
  });

  return lines.join("\n");
}
