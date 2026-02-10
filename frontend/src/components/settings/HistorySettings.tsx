"use client";

import { useState } from "react";
import { useAppStore, TranscriptionHistory } from "@/store/app-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Edit2, Save, X, Copy, Download, FileText, FileCode } from "lucide-react";

export function HistorySettings() {
    const { transcriptions, updateTranscription, deleteTranscription, clearHistory } = useAppStore();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editText, setEditText] = useState("");
    const [searchQuery, setSearchQuery] = useState("");

    const filteredTranscriptions = transcriptions.filter((t) =>
        t.text.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleEdit = (transcription: TranscriptionHistory) => {
        setEditingId(transcription.id);
        setEditText(transcription.text);
    };

    const handleSave = (id: string) => {
        updateTranscription(id, { text: editText });
        setEditingId(null);
        setEditText("");
    };

    const handleCancel = () => {
        setEditingId(null);
        setEditText("");
    };

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    const handleExport = (transcription: TranscriptionHistory, format: 'md' | 'txt' = 'md') => {
        let content: string;
        let filename: string;
        let mimeType: string;

        if (format === 'txt') {
            // Simple TXT format
            content = `转录记录
日期: ${new Date(transcription.date).toLocaleString('zh-CN')}
时长: ${transcription.duration.toFixed(1)}秒
引擎: ${transcription.engine}
模型: ${transcription.model}
语言: ${transcription.language}

${transcription.text}

--- 分段内容 ---
${transcription.segments.map((s, i) => 
    `${i + 1}. [${s.start.toFixed(1)}秒 - ${s.end.toFixed(1)}秒]${s.speaker ? ` (${s.speaker})` : ''}: ${s.text}`
).join('\n')}
`;
            filename = `转录_${transcription.id}.txt`;
            mimeType = 'text/plain';
        } else {
            // Markdown format
            content = `# 转录记录
日期: ${new Date(transcription.date).toLocaleString('zh-CN')}
时长: ${transcription.duration.toFixed(1)}秒
引擎: ${transcription.engine}
模型: ${transcription.model}
语言: ${transcription.language}

## 文本内容
${transcription.text}

## 分段内容
${transcription.segments.map((s, i) => 
    `${i + 1}. [${s.start.toFixed(1)}秒 - ${s.end.toFixed(1)}秒]${s.speaker ? ` (${s.speaker})` : ''}: ${s.text}`
).join('\n')}
`;
            filename = `转录_${transcription.id}.md`;
            mimeType = 'text/markdown';
        }

        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleString('zh-CN');
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">转录历史</h3>
                <p className="text-sm text-muted-foreground">
                    查看、编辑和管理您的转录历史记录
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
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="flex items-end">
                        <Button
                            variant="destructive"
                            onClick={clearHistory}
                            disabled={transcriptions.length === 0}
                        >
                            清空全部
                        </Button>
                    </div>
                </div>

                <div className="text-sm text-muted-foreground">
                    共 {transcriptions.length} 条记录
                </div>

                <div className="space-y-4 max-h-[500px] overflow-y-auto">
                    {filteredTranscriptions.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            {searchQuery ? "未找到匹配的转录记录" : "暂无转录记录"}
                        </div>
                    ) : (
                        filteredTranscriptions.map((transcription) => (
                            <div
                                key={transcription.id}
                                className="border rounded-lg p-4 space-y-2"
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="text-xs text-muted-foreground">
                                            {formatDate(transcription.date)} • {transcription.duration.toFixed(1)}s
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            {transcription.engine} / {transcription.model} / {transcription.language}
                                        </div>
                                    </div>
                                    <div className="flex gap-1">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleCopy(transcription.text)}
                                            title="复制到剪贴板"
                                        >
                                            <Copy className="h-4 w-4" />
                                        </Button>
                                        <div className="relative group">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                title="导出"
                                            >
                                                <Download className="h-4 w-4" />
                                            </Button>
                                            <div className="absolute right-0 top-full mt-1 hidden group-hover:block z-10">
                                                <div className="bg-popover border rounded-md shadow-md py-1 min-w-[120px]">
                                                    <button
                                                        className="w-full px-3 py-1.5 text-sm hover:bg-accent flex items-center gap-2"
                                                        onClick={() => handleExport(transcription, 'txt')}
                                                    >
                                                        <FileText className="h-3 w-3" />
                                                        导出为 TXT
                                                    </button>
                                                    <button
                                                        className="w-full px-3 py-1.5 text-sm hover:bg-accent flex items-center gap-2"
                                                        onClick={() => handleExport(transcription, 'md')}
                                                    >
                                                        <FileCode className="h-3 w-3" />
                                                        导出为 MD
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                        {editingId === transcription.id ? (
                                            <>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleSave(transcription.id)}
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
                                                onClick={() => handleEdit(transcription)}
                                            >
                                                <Edit2 className="h-4 w-4" />
                                            </Button>
                                        )}
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => deleteTranscription(transcription.id)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>

                                {editingId === transcription.id ? (
                                    <textarea
                                        className="w-full min-h-[100px] p-2 border rounded-md"
                                        value={editText}
                                        onChange={(e) => setEditText(e.target.value)}
                                    />
                                ) : (
                                    <div className="text-sm whitespace-pre-wrap">
                                        {transcription.text}
                                    </div>
                                )}

                                {transcription.segments.length > 0 && (
                                    <details className="text-xs">
                                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                            查看分段 ({transcription.segments.length})
                                        </summary>
                                        <div className="mt-2 space-y-1 pl-4">
                                            {transcription.segments.map((segment, i) => (
                                                <div key={i} className="text-muted-foreground">
                                                    [{segment.start.toFixed(1)}秒 - {segment.end.toFixed(1)}秒]
                                                    {segment.speaker && ` (${segment.speaker})`}: {segment.text}
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
