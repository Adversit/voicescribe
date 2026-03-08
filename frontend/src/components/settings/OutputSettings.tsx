"use client";

import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface OutputConfig {
    meetingOutputFormat: string;
}

export function OutputSettings() {
    const [config, setConfig] = useState<OutputConfig>({
        meetingOutputFormat: "with_speakers",
    });

    useEffect(() => {
        const loadSettings = async () => {
            if (typeof window !== "undefined" && window.electron) {
                try {
                    const settings = await window.electron.settings.get();
                    setConfig({
                        meetingOutputFormat: settings.meetingOutputFormat || "with_speakers",
                    });
                } catch (err) {
                    console.error("Failed to load settings:", err);
                }
            }
        };
        loadSettings();
    }, []);

    const updateConfig = (updates: Partial<OutputConfig>) => {
        const newConfig = { ...config, ...updates };
        setConfig(newConfig);
        if (typeof window !== "undefined" && window.electron) {
            window.electron.settings.update(updates);
        }
    };

    return (
        <div className="space-y-6">
            <div className="space-y-4">
                <div>
                    <h3 className="text-lg font-medium">会议录制输出格式</h3>
                    <p className="text-sm text-muted-foreground">
                        会议录制结束后的文本输出格式
                    </p>
                </div>
                <div className="space-y-2">
                    <Label>输出格式</Label>
                    <Select
                        value={config.meetingOutputFormat}
                        onValueChange={(value) =>
                            updateConfig({ meetingOutputFormat: value })
                        }
                    >
                        <SelectTrigger className="w-[240px]">
                            <SelectValue placeholder="选择输出格式" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="text_only">纯文本</SelectItem>
                            <SelectItem value="with_speakers">带说话人标签</SelectItem>
                            <SelectItem value="with_summary">带摘要</SelectItem>
                            <SelectItem value="full">完整（说话人 + 摘要 + 待办）</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
        </div>
    );
}
