"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/app-store";

export function AskAnswerPanel() {
    const { askAnswer, setAskAnswer, setOperationNotice } = useAppStore();
    const [inserting, setInserting] = useState(false);

    if (!askAnswer) return null;

    const copyAnswer = async () => {
        try {
            await navigator.clipboard.writeText(askAnswer.answer);
            setOperationNotice({
                type: "success",
                message: "答案已复制到剪贴板",
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            setOperationNotice({
                type: "error",
                message: "复制失败",
                detail: String(error),
                timestamp: new Date().toISOString(),
            });
        }
    };

    const insertAnswer = async () => {
        if (!window.electron?.selection) return;
        setInserting(true);
        try {
            const result = await window.electron.selection.replace(askAnswer.answer);
            if (result.success) {
                setOperationNotice({
                    type: "success",
                    message: "答案已插入到目标应用",
                    timestamp: new Date().toISOString(),
                });
                return;
            }

            await navigator.clipboard.writeText(askAnswer.answer);
            setOperationNotice({
                type: "error",
                message: "插入失败，已复制到剪贴板",
                detail: result.error,
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            setOperationNotice({
                type: "error",
                message: "插入失败",
                detail: String(error),
                timestamp: new Date().toISOString(),
            });
        } finally {
            setInserting(false);
        }
    };

    return (
        <div className="fixed right-4 bottom-4 z-50 w-[420px] max-w-[calc(100vw-2rem)] rounded-lg border bg-background shadow-lg">
            <div className="flex items-center justify-between border-b px-4 py-3">
                <h3 className="text-sm font-semibold">选中文本问答结果</h3>
                <Button variant="ghost" size="sm" onClick={() => setAskAnswer(null)}>
                    关闭
                </Button>
            </div>
            <div className="space-y-3 px-4 py-3 text-sm">
                <div>
                    <div className="mb-1 text-xs text-muted-foreground">问题</div>
                    <div className="rounded-md bg-muted/50 p-2 whitespace-pre-wrap">{askAnswer.question}</div>
                </div>

                {askAnswer.contextPreview ? (
                    <div>
                        <div className="mb-1 text-xs text-muted-foreground">上下文预览</div>
                        <div className="max-h-24 overflow-auto rounded-md bg-muted/50 p-2 whitespace-pre-wrap">
                            {askAnswer.contextPreview}
                        </div>
                    </div>
                ) : null}

                <div>
                    <div className="mb-1 text-xs text-muted-foreground">答案</div>
                    <div className="max-h-48 overflow-auto rounded-md bg-muted/50 p-2 whitespace-pre-wrap">
                        {askAnswer.answer}
                    </div>
                </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
                <Button variant="secondary" onClick={() => void copyAnswer()}>
                    复制答案
                </Button>
                <Button onClick={() => void insertAnswer()} disabled={inserting}>
                    {inserting ? "插入中..." : "插入到当前应用"}
                </Button>
            </div>
        </div>
    );
}
