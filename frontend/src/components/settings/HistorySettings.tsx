"use client";

import { useEffect, useState } from "react";
import { useRecordingStore, type RecordingRecord } from "@/store/recording-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Trash2,
    Edit2,
    Save,
    X,
    Copy,
    Download,
    FileText,
    FileCode,
    ArrowLeft,
    Radio,
} from "lucide-react";
import { SpeakerFilter } from "../history/SpeakerFilter";
import {
    exportRecordingAsMarkdown,
    exportRecordingAsText,
    type MeetingOutputFormat,
} from "@/lib/export-recording";

export function HistorySettings() {
    const { history, updateRecord, deleteRecord, clearHistory } = useRecordingStore();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editText, setEditText] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [detailRecord, setDetailRecord] = useState<RecordingRecord | null>(null);
    const [selectedSpeaker, setSelectedSpeaker] = useState<string | null>(null);
    const [exportMenuId, setExportMenuId] = useState<string | null>(null);
    const [meetingOutputFormat, setMeetingOutputFormat] =
        useState<MeetingOutputFormat>("full");

    useEffect(() => {
        const loadSettings = async () => {
            if (typeof window === "undefined" || !window.electron) return;
            try {
                const settings = await window.electron.settings.get();
                setMeetingOutputFormat(
                    (settings.meetingOutputFormat || "full") as MeetingOutputFormat
                );
            } catch (err) {
                console.error("Failed to load meeting output format:", err);
            }
        };
        void loadSettings();
    }, []);

    const filteredRecords = history.filter((record) =>
        record.text.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleEdit = (record: RecordingRecord) => {
        setEditingId(record.id);
        setEditText(record.text);
    };

    const handleSave = (id: string) => {
        updateRecord(id, { text: editText });
        setEditingId(null);
        setEditText("");
    };

    const handleCancel = () => {
        setEditingId(null);
        setEditText("");
    };

    const handleCopy = (record: RecordingRecord) => {
        const content = exportRecordingAsText(record, meetingOutputFormat);
        void navigator.clipboard.writeText(content);
    };

    const handleExport = (record: RecordingRecord, format: "md" | "txt") => {
        const isMarkdown = format === "md";
        const content = isMarkdown
            ? exportRecordingAsMarkdown(record, meetingOutputFormat)
            : exportRecordingAsText(record, meetingOutputFormat);
        const filename = `transcript_${record.id.slice(0, 8)}.${format}`;
        const mimeType = isMarkdown ? "text/markdown" : "text/plain";

        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        URL.revokeObjectURL(url);
        setExportMenuId(null);
    };

    const formatDate = (timestamp: number) =>
        new Date(timestamp).toLocaleString("zh-CN");

    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    if (detailRecord) {
        const filteredUtterances = selectedSpeaker
            ? (detailRecord.utterances || []).filter(
                  (utterance) => utterance.speaker === selectedSpeaker
              )
            : detailRecord.utterances || [];

        const speakerColors = [
            "text-blue-400",
            "text-green-400",
            "text-yellow-400",
            "text-purple-400",
            "text-pink-400",
            "text-cyan-400",
            "text-orange-400",
            "text-red-400",
        ];
        const speakerColorMap = new Map<string, string>();

        function getSpeakerColor(speaker: string): string {
            if (!speakerColorMap.has(speaker)) {
                speakerColorMap.set(
                    speaker,
                    speakerColors[speakerColorMap.size % speakerColors.length]
                );
            }
            return speakerColorMap.get(speaker)!;
        }

        const durationMin = Math.floor(detailRecord.duration / 60);
        const durationSec = Math.floor(detailRecord.duration % 60);

        return (
            <div className="flex flex-col h-full">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => {
                                setDetailRecord(null);
                                setSelectedSpeaker(null);
                            }}
                            className="text-muted-foreground hover:text-foreground"
                        >
                            <ArrowLeft className="h-4 w-4" />
                        </button>
                        <div>
                            <h3 className="text-sm font-medium">
                                {formatDate(detailRecord.timestamp)}
                            </h3>
                            <p className="text-xs text-muted-foreground">
                                {durationMin}分{durationSec}秒 ·{" "}
                                {(detailRecord.utterances || []).length} 条发言 ·{" "}
                                {detailRecord.engine}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-1.5">
                        <button
                            onClick={() => handleCopy(detailRecord)}
                            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
                            title="复制"
                        >
                            <Copy className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => handleExport(detailRecord, "md")}
                            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
                            title="导出 MD"
                        >
                            <FileCode className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => {
                                deleteRecord(detailRecord.id);
                                setDetailRecord(null);
                            }}
                            className="p-1.5 rounded-md hover:bg-muted text-red-400"
                            title="删除"
                        >
                            <Trash2 className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                {detailRecord.utterances && detailRecord.utterances.length > 0 && (
                    <SpeakerFilter
                        utterances={detailRecord.utterances}
                        selectedSpeaker={selectedSpeaker}
                        onSelect={setSelectedSpeaker}
                    />
                )}

                <div className="flex-1 overflow-y-auto space-y-3 mt-2">
                    {filteredUtterances.map((utterance) => (
                        <div key={utterance.id}>
                            <div className="flex items-baseline gap-2 mb-0.5">
                                <span
                                    className={`font-medium text-sm ${getSpeakerColor(
                                        utterance.speaker
                                    )}`}
                                >
                                    {utterance.speaker}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {formatTime(utterance.start)}
                                </span>
                            </div>
                            <p className="text-sm pl-0.5">{utterance.text}</p>
                        </div>
                    ))}
                </div>

                {detailRecord.summary && (
                    <div className="border-t p-4 space-y-2 mt-2">
                        <h3 className="text-sm font-medium text-muted-foreground">
                            摘要
                        </h3>
                        <p className="text-sm">{detailRecord.summary.content}</p>
                        {detailRecord.summary.decisions.length > 0 && (
                            <div>
                                <h4 className="text-xs font-medium text-muted-foreground mb-1">
                                    决策
                                </h4>
                                <ul className="text-sm list-disc list-inside">
                                    {detailRecord.summary.decisions.map((decision, index) => (
                                        <li key={index}>{decision}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {detailRecord.summary.actionItems.length > 0 && (
                            <div>
                                <h4 className="text-xs font-medium text-muted-foreground mb-1">
                                    待办
                                </h4>
                                <ul className="text-sm list-disc list-inside">
                                    {detailRecord.summary.actionItems.map((item, index) => (
                                        <li key={index}>
                                            <span className="text-blue-400">
                                                {item.assignee}
                                            </span>
                                            : {item.task}
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

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">历史记录</h3>
                <p className="text-sm text-muted-foreground">
                    查看和管理所有转录历史
                </p>
            </div>

            <div className="space-y-4">
                <div className="flex gap-2">
                    <div className="flex-1">
                        <Label htmlFor="search">搜索</Label>
                        <Input
                            id="search"
                            placeholder="搜索转录内容..."
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                        />
                    </div>
                    <div className="flex items-end">
                        <Button
                            variant="destructive"
                            onClick={clearHistory}
                            disabled={history.length === 0}
                        >
                            清空全部
                        </Button>
                    </div>
                </div>

                <div className="text-sm text-muted-foreground">
                    共 {history.length} 条记录
                </div>

                <div className="space-y-4 max-h-[500px] overflow-y-auto">
                    {filteredRecords.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            {searchQuery ? "未找到匹配的记录" : "暂无转录记录"}
                        </div>
                    ) : (
                        filteredRecords.map((record) => (
                            <div key={record.id} className="border rounded-lg p-4 space-y-2">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-muted-foreground">
                                                {formatDate(record.timestamp)} ·{" "}
                                                {record.duration.toFixed(1)}s
                                            </span>
                                            {record.isStreaming && (
                                                <span className="inline-flex items-center gap-1 text-xs bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded">
                                                    <Radio className="h-3 w-3" />
                                                    流式
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            {record.engine}
                                            {record.model ? ` / ${record.model}` : ""}
                                            {record.language ? ` / ${record.language}` : ""}
                                        </div>
                                    </div>
                                    <div className="flex gap-1">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleCopy(record)}
                                            title="复制"
                                        >
                                            <Copy className="h-4 w-4" />
                                        </Button>
                                        <div className="relative">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                title="导出"
                                                onClick={() =>
                                                    setExportMenuId((current) =>
                                                        current === record.id ? null : record.id
                                                    )
                                                }
                                            >
                                                <Download className="h-4 w-4" />
                                            </Button>
                                            {exportMenuId === record.id && (
                                                <div className="absolute right-0 top-full mt-1 z-10">
                                                    <div className="bg-popover border rounded-md shadow-md py-1 min-w-[120px]">
                                                        <button
                                                            className="w-full px-3 py-1.5 text-sm hover:bg-accent flex items-center gap-2"
                                                            onClick={() =>
                                                                handleExport(record, "txt")
                                                            }
                                                        >
                                                            <FileText className="h-3 w-3" /> TXT
                                                        </button>
                                                        <button
                                                            className="w-full px-3 py-1.5 text-sm hover:bg-accent flex items-center gap-2"
                                                            onClick={() =>
                                                                handleExport(record, "md")
                                                            }
                                                        >
                                                            <FileCode className="h-3 w-3" /> MD
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        {record.isStreaming &&
                                            record.utterances &&
                                            record.utterances.length > 0 && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setDetailRecord(record)}
                                                    title="查看详情"
                                                >
                                                    <ArrowLeft className="h-4 w-4 rotate-180" />
                                                </Button>
                                            )}
                                        {editingId === record.id ? (
                                            <>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleSave(record.id)}
                                                >
                                                    <Save className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={handleCancel}
                                                >
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            </>
                                        ) : (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleEdit(record)}
                                            >
                                                <Edit2 className="h-4 w-4" />
                                            </Button>
                                        )}
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => deleteRecord(record.id)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>

                                {editingId === record.id ? (
                                    <textarea
                                        className="w-full min-h-[100px] p-2 border rounded-md"
                                        value={editText}
                                        onChange={(event) => setEditText(event.target.value)}
                                    />
                                ) : (
                                    <div className="text-sm whitespace-pre-wrap line-clamp-3">
                                        {record.text}
                                    </div>
                                )}

                                {!record.isStreaming && record.segments.length > 0 && (
                                    <details className="text-xs">
                                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                            查看分段 ({record.segments.length})
                                        </summary>
                                        <div className="mt-2 space-y-1 pl-4">
                                            {record.segments.map((segment, index) => (
                                                <div
                                                    key={index}
                                                    className="text-muted-foreground"
                                                >
                                                    [{segment.start.toFixed(1)}s -{" "}
                                                    {segment.end.toFixed(1)}s]
                                                    {segment.speaker
                                                        ? ` (${segment.speaker})`
                                                        : ""}
                                                    : {segment.text}
                                                </div>
                                            ))}
                                        </div>
                                    </details>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
