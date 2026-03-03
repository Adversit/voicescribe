"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/app-store";

const STYLE_MAP = {
    info: "border-blue-200 bg-blue-50 text-blue-900",
    success: "border-green-200 bg-green-50 text-green-900",
    error: "border-red-200 bg-red-50 text-red-900",
} as const;

export function OperationNoticeBanner() {
    const { operationNotice, setOperationNotice } = useAppStore();

    useEffect(() => {
        if (!operationNotice) return;
        const timer = setTimeout(() => setOperationNotice(null), 6000);
        return () => clearTimeout(timer);
    }, [operationNotice, setOperationNotice]);

    if (!operationNotice) return null;

    return (
        <div className="fixed top-4 left-1/2 z-50 w-[560px] max-w-[calc(100vw-2rem)] -translate-x-1/2">
            <div className={`rounded-md border px-4 py-3 shadow-sm ${STYLE_MAP[operationNotice.type]}`}>
                <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                        <p className="text-sm font-medium">{operationNotice.message}</p>
                        {operationNotice.detail ? (
                            <p className="text-xs opacity-90 whitespace-pre-wrap">{operationNotice.detail}</p>
                        ) : null}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setOperationNotice(null)}>
                        关闭
                    </Button>
                </div>
            </div>
        </div>
    );
}
