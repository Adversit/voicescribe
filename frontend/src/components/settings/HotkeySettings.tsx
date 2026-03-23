"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
    createDefaultHotkeyConfig,
    formatHotkeyConfig,
    formatHotkeyKeys,
    normalizeBrowserCapturedKey,
    sortHotkeyKeys,
    type HotkeyConfig,
    type HotkeyKey,
} from "@/lib/hotkey-config";

export function HotkeySettings() {
    const [config, setConfig] = useState<HotkeyConfig>(createDefaultHotkeyConfig());
    const [isCapturing, setIsCapturing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [capturedKeys, setCapturedKeys] = useState<HotkeyKey[]>([]);
    const captureKeysRef = useRef<Set<HotkeyKey>>(new Set());

    useEffect(() => {
        if (typeof window !== "undefined" && window.electron?.hotkey) {
            window.electron.hotkey.get().then((savedConfig: HotkeyConfig) => {
                if (savedConfig) {
                    setConfig(savedConfig);
                }
            });
        }
    }, []);

    useEffect(() => {
        if (!isCapturing) {
            captureKeysRef.current.clear();
            setCapturedKeys([]);
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            event.preventDefault();
            event.stopPropagation();

            if (event.code === "Escape") {
                captureKeysRef.current.clear();
                setIsCapturing(false);
                return;
            }

            const key = normalizeBrowserCapturedKey(event);
            if (!key) {
                return;
            }

            captureKeysRef.current.add(key);
            setCapturedKeys(sortHotkeyKeys([...captureKeysRef.current]));
        };

        const handleKeyUp = (event: KeyboardEvent) => {
            event.preventDefault();
            event.stopPropagation();

            const key = normalizeBrowserCapturedKey(event);
            if (!key) {
                return;
            }

            captureKeysRef.current.add(key);
            const nextKeys = sortHotkeyKeys([...captureKeysRef.current]);
            if (nextKeys.length > 0) {
                setConfig({
                    recordingShortcut: {
                        keys: nextKeys,
                    },
                });
            }
            captureKeysRef.current.clear();
            setCapturedKeys([]);
            setIsCapturing(false);
        };

        window.addEventListener("keydown", handleKeyDown, true);
        window.addEventListener("keyup", handleKeyUp, true);
        return () => {
            window.removeEventListener("keydown", handleKeyDown, true);
            window.removeEventListener("keyup", handleKeyUp, true);
        };
    }, [isCapturing]);

    const preview = useMemo(() => formatHotkeyConfig(config), [config]);
    const capturePreview = useMemo(() => formatHotkeyKeys(capturedKeys), [capturedKeys]);

    const applyHotkey = async () => {
        if (typeof window === "undefined" || !window.electron?.hotkey) {
            return;
        }

        setIsSaving(true);
        setSaveError(null);
        try {
            const result = await window.electron.hotkey.update(config);
            if (!result?.success) {
                setSaveError("快捷键保存失败");
            }
        } catch (error) {
            setSaveError(String(error));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">快捷键</h3>
                <p className="text-sm text-muted-foreground">
                    支持单键和组合键。短按开始或停止录音，长按会在按住后开始录音，松开即停止。
                </p>
            </div>

            <div className="space-y-4 rounded-xl border border-border/60 p-4">
                <div className="space-y-2">
                    <Label>录音快捷键</Label>
                    <div className="flex flex-wrap items-center gap-3">
                        <Button
                            variant={isCapturing ? "secondary" : "default"}
                            onClick={() => {
                                setIsCapturing((current) => !current);
                                captureKeysRef.current.clear();
                                setCapturedKeys([]);
                            }}
                        >
                            {isCapturing ? "按下快捷键..." : "录制快捷键"}
                        </Button>
                        <span className="text-sm text-muted-foreground">
                            {isCapturing ? capturePreview : preview}
                        </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        点击“录制快捷键”后直接按下目标按键。按 Esc 仅会取消本次录制，不会写入为快捷键。
                    </p>
                </div>

                <div className="flex items-center gap-4 rounded-lg bg-muted/50 p-4">
                    <Keyboard className="h-5 w-5 text-blue-500" />
                    <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">当前录音快捷键</p>
                        <p className="font-medium text-foreground">{preview}</p>
                        <p className="text-xs text-muted-foreground">
                            Esc 固定用于取消录制，不参与快捷键配置。
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <Button onClick={() => void applyHotkey()} disabled={isSaving || isCapturing}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        保存快捷键
                    </Button>
                    {saveError && <span className="text-sm text-red-500">{saveError}</span>}
                </div>
            </div>
        </div>
    );
}
