"use client";

import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface LLMConfig {
    llmProvider: string;
    llmModel: string;
    customApiUrl: string;
    customApiKey: string;
    summaryInterval: number;
}

export function LLMSettings() {
    const [config, setConfig] = useState<LLMConfig>({
        llmProvider: "claude_cli",
        llmModel: "haiku",
        customApiUrl: "",
        customApiKey: "",
        summaryInterval: 120,
    });

    useEffect(() => {
        const loadSettings = async () => {
            if (typeof window !== "undefined" && window.electron) {
                try {
                    const settings = await window.electron.settings.get();
                    setConfig({
                        llmProvider: settings.llmProvider || "claude_cli",
                        llmModel: settings.llmModel || "haiku",
                        customApiUrl: settings.customApiUrl || "",
                        customApiKey: settings.customApiKey || "",
                        summaryInterval: settings.summaryInterval || 120,
                    });
                } catch (err) {
                    console.error("Failed to load settings:", err);
                }
            }
        };
        loadSettings();
    }, []);

    const updateConfig = (updates: Partial<LLMConfig>) => {
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
                    <h3 className="text-lg font-medium">AI 模型设置</h3>
                    <p className="text-sm text-muted-foreground">
                        用于文本优化和会议摘要的 LLM 配置
                    </p>
                </div>

                <div className="space-y-2">
                    <Label>LLM 提供商</Label>
                    <Select
                        value={config.llmProvider}
                        onValueChange={(value) =>
                            updateConfig({ llmProvider: value })
                        }
                    >
                        <SelectTrigger className="w-[240px]">
                            <SelectValue placeholder="选择提供商" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="claude_cli">Claude CLI（无需 API Key）</SelectItem>
                            <SelectItem value="anthropic_api">Anthropic API</SelectItem>
                            <SelectItem value="custom">自定义 API</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label>模型</Label>
                    <Input
                        value={config.llmModel}
                        onChange={(e) => updateConfig({ llmModel: e.target.value })}
                        placeholder="haiku"
                        className="w-[240px]"
                    />
                </div>

                <div className="space-y-2">
                    <Label>摘要生成间隔（秒）</Label>
                    <Select
                        value={String(config.summaryInterval)}
                        onValueChange={(value) =>
                            updateConfig({ summaryInterval: Number(value) })
                        }
                    >
                        <SelectTrigger className="w-[240px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="60">60 秒</SelectItem>
                            <SelectItem value="120">120 秒</SelectItem>
                            <SelectItem value="180">180 秒</SelectItem>
                            <SelectItem value="300">300 秒</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {config.llmProvider === "custom" && (
                <div className="space-y-4">
                    <div>
                        <h3 className="text-lg font-medium">自定义 API</h3>
                    </div>
                    <div className="space-y-2">
                        <Label>API URL</Label>
                        <Input
                            value={config.customApiUrl}
                            onChange={(e) =>
                                updateConfig({ customApiUrl: e.target.value })
                            }
                            placeholder="https://api.example.com/v1/chat/completions"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>API Key</Label>
                        <Input
                            type="password"
                            value={config.customApiKey}
                            onChange={(e) =>
                                updateConfig({ customApiKey: e.target.value })
                            }
                            placeholder="sk-..."
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
