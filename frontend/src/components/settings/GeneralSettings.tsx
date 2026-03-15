"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { CheckCircle2 } from "lucide-react";

interface GeneralConfig {
    language: string;
    outputMode: string;
    meetingOutputFormat: string;
    enableDiarization: boolean;
    enableAIRefine: boolean;
    enableAISummary: boolean;
    enableStreaming: boolean;
    llmProvider: string;
    llmModel: string;
    customApiUrl: string;
    customApiKey: string;
    summaryInterval: number;
}

export function GeneralSettings() {
    const [config, setConfig] = useState<GeneralConfig>({
        language: "zh",
        outputMode: "clipboard",
        meetingOutputFormat: "with_speakers",
        enableDiarization: false,
        enableAIRefine: false,
        enableAISummary: false,
        enableStreaming: false,
        llmProvider: "claude_cli",
        llmModel: "haiku",
        customApiUrl: "",
        customApiKey: "",
        summaryInterval: 120,
    });
    const [backendConnected, setBackendConnected] = useState(false);
    const [appVersion, setAppVersion] = useState("0.0.0");

    useEffect(() => {
        const loadSettings = async () => {
            if (typeof window === "undefined" || !window.electron) return;

            try {
                const settings = await window.electron.settings.get();
                setConfig({
                    language: settings.language || "zh",
                    outputMode: settings.outputFormat || "clipboard",
                    meetingOutputFormat:
                        settings.meetingOutputFormat || "with_speakers",
                    enableDiarization: settings.enableDiarization || false,
                    enableAIRefine: settings.enableAiRefine || false,
                    enableAISummary: settings.enableAiSummary || false,
                    enableStreaming: settings.enableStreaming || false,
                    llmProvider: settings.llmProvider || "claude_cli",
                    llmModel: settings.llmModel || "haiku",
                    customApiUrl: settings.customApiUrl || "",
                    customApiKey: settings.customApiKey || "",
                    summaryInterval: settings.summaryInterval || 120,
                });
            } catch (err) {
                console.error("Failed to load settings:", err);
            }

            try {
                const version = await window.electron.app.getVersion();
                setAppVersion(version);
            } catch (err) {
                console.error("Failed to get app version:", err);
            }
        };

        void loadSettings();
        void checkBackendConnection();
    }, []);

    const checkBackendConnection = async () => {
        if (typeof window !== "undefined" && window.electron) {
            try {
                const result = await window.electron.backend.checkHealth();
                setBackendConnected(result.healthy);
            } catch {
                setBackendConnected(false);
            }
            return;
        }

        try {
            const res = await fetch("http://127.0.0.1:8765/health");
            setBackendConnected(res.ok);
        } catch {
            setBackendConnected(false);
        }
    };

    const updateConfig = (updates: Partial<GeneralConfig>) => {
        const newConfig = { ...config, ...updates };

        const hasSpeakers = newConfig.enableDiarization;
        const hasSummary = newConfig.enableAISummary;
        const fmt = newConfig.meetingOutputFormat;
        if (
            (fmt === "with_speakers" && !hasSpeakers) ||
            (fmt === "with_summary" && !hasSummary) ||
            (fmt === "full" && (!hasSpeakers || !hasSummary))
        ) {
            newConfig.meetingOutputFormat = "text_only";
        }

        setConfig(newConfig);

        if (typeof window === "undefined" || !window.electron) return;

        const settingsUpdate: Record<string, unknown> = {};
        if (updates.language !== undefined) settingsUpdate.language = updates.language;
        if (updates.outputMode !== undefined) {
            settingsUpdate.outputFormat = updates.outputMode;
        }
        if (
            updates.meetingOutputFormat !== undefined ||
            newConfig.meetingOutputFormat !== config.meetingOutputFormat
        ) {
            settingsUpdate.meetingOutputFormat = newConfig.meetingOutputFormat;
        }
        if (updates.enableDiarization !== undefined) {
            settingsUpdate.enableDiarization = updates.enableDiarization;
        }
        if (updates.enableAIRefine !== undefined) {
            settingsUpdate.enableAiRefine = updates.enableAIRefine;
        }
        if (updates.enableAISummary !== undefined) {
            settingsUpdate.enableAiSummary = updates.enableAISummary;
        }
        if (updates.enableStreaming !== undefined) {
            settingsUpdate.enableStreaming = updates.enableStreaming;
        }
        if (updates.llmProvider !== undefined) {
            settingsUpdate.llmProvider = updates.llmProvider;
        }
        if (updates.llmModel !== undefined) {
            settingsUpdate.llmModel = updates.llmModel;
        }
        if (updates.customApiUrl !== undefined) {
            settingsUpdate.customApiUrl = updates.customApiUrl;
        }
        if (updates.customApiKey !== undefined) {
            settingsUpdate.customApiKey = updates.customApiKey;
        }
        if (updates.summaryInterval !== undefined) {
            settingsUpdate.summaryInterval = updates.summaryInterval;
        }
        void window.electron.settings.update(settingsUpdate);
    };

    return (
        <div className="space-y-6">
            <div className="space-y-4">
                <h3 className="text-lg font-medium">语言</h3>
                <div className="space-y-2">
                    <Label>默认语言</Label>
                    <Select
                        value={config.language}
                        onValueChange={(value) => updateConfig({ language: value })}
                    >
                        <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="选择语言" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="zh">中文</SelectItem>
                            <SelectItem value="en">英文</SelectItem>
                            <SelectItem value="ja">日文</SelectItem>
                            <SelectItem value="auto">自动检测</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="border-t" />

            <div className="space-y-4">
                <h3 className="text-lg font-medium">输出</h3>
                <div className="space-y-2">
                    <Label>转录完成后</Label>
                    <Select
                        value={config.outputMode}
                        onValueChange={(value) => updateConfig({ outputMode: value })}
                    >
                        <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="选择输出方式" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="directInput">直接输入到应用</SelectItem>
                            <SelectItem value="clipboard">复制到剪贴板</SelectItem>
                            <SelectItem value="both">两者都执行</SelectItem>
                        </SelectContent>
                    </Select>
                    {config.outputMode !== "clipboard" && (
                        <div className="flex items-center gap-2 p-3 rounded-md bg-muted">
                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                            <span className="text-sm">
                                Windows 无需额外权限配置
                            </span>
                        </div>
                    )}
                </div>

                <div className="space-y-2">
                    <Label>流式转录输出格式</Label>
                    <Select
                        value={config.meetingOutputFormat}
                        onValueChange={(value) =>
                            updateConfig({ meetingOutputFormat: value })
                        }
                    >
                        <SelectTrigger className="w-[260px]">
                            <SelectValue placeholder="选择格式" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="text_only">纯文本</SelectItem>
                            <SelectItem
                                value="with_speakers"
                                disabled={!config.enableDiarization}
                            >
                                带说话人标签
                            </SelectItem>
                            <SelectItem
                                value="with_summary"
                                disabled={!config.enableAISummary}
                            >
                                带摘要
                            </SelectItem>
                            <SelectItem
                                value="full"
                                disabled={
                                    !config.enableDiarization || !config.enableAISummary
                                }
                            >
                                完整（说话人 + 摘要 + 待办）
                            </SelectItem>
                        </SelectContent>
                    </Select>
                    {(!config.enableDiarization || !config.enableAISummary) && (
                        <p className="text-xs text-muted-foreground">
                            {[
                                !config.enableDiarization && "启用说话人识别",
                                !config.enableAISummary && "启用 AI 摘要",
                            ]
                                .filter(Boolean)
                                .join("、")}
                            后可解锁更多格式
                        </p>
                    )}
                </div>
            </div>

            <div className="border-t" />

            <div className="space-y-4">
                <h3 className="text-lg font-medium">录制选项</h3>
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label htmlFor="streaming">启用流式传输</Label>
                            <p className="text-xs text-muted-foreground">
                                {config.enableStreaming
                                    ? "实时逐句显示（WS /stream）"
                                    : "录完再出结果（POST /transcribe）"}
                            </p>
                        </div>
                        <Switch
                            id="streaming"
                            checked={config.enableStreaming}
                            onCheckedChange={(checked) =>
                                updateConfig({ enableStreaming: checked })
                            }
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label htmlFor="diarization">启用说话人识别</Label>
                            <p className="text-xs text-muted-foreground">
                                {config.enableStreaming
                                    ? "流式传输中实时识别说话人"
                                    : "转录完成后识别说话人"}
                            </p>
                        </div>
                        <Switch
                            id="diarization"
                            checked={config.enableDiarization}
                            onCheckedChange={(checked) =>
                                updateConfig({ enableDiarization: checked })
                            }
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label htmlFor="ai-refine">启用 AI 文本优化</Label>
                            <p className="text-xs text-muted-foreground">
                                用于纠正错别字、清理语气词，不再负责流式摘要
                            </p>
                        </div>
                        <Switch
                            id="ai-refine"
                            checked={config.enableAIRefine}
                            onCheckedChange={(checked) =>
                                updateConfig({ enableAIRefine: checked })
                            }
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label htmlFor="ai-summary">启用 AI 摘要</Label>
                            <p className="text-xs text-muted-foreground">
                                仅控制流式摘要、决策和待办提取
                            </p>
                        </div>
                        <Switch
                            id="ai-summary"
                            checked={config.enableAISummary}
                            onCheckedChange={(checked) =>
                                updateConfig({ enableAISummary: checked })
                            }
                        />
                    </div>
                </div>
            </div>

            <div className="border-t" />

            <div className="space-y-4">
                <div>
                    <h3 className="text-lg font-medium">AI 模型</h3>
                    <p className="text-sm text-muted-foreground">
                        用于文本优化和流式摘要的 LLM 配置
                    </p>
                </div>

                <div className="space-y-2">
                    <Label>LLM 提供商</Label>
                    <Select
                        value={config.llmProvider}
                        onValueChange={(value) => updateConfig({ llmProvider: value })}
                    >
                        <SelectTrigger className="w-[240px]">
                            <SelectValue placeholder="选择提供商" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="claude_cli">
                                Claude CLI（无需 API Key）
                            </SelectItem>
                            <SelectItem value="anthropic_api">
                                Anthropic API
                            </SelectItem>
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

                {config.llmProvider === "custom" && (
                    <div className="space-y-4 pt-2">
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

            <div className="border-t" />

            <div className="space-y-4">
                <h3 className="text-lg font-medium">关于</h3>
                <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">版本</span>
                        <span>{appVersion}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">后端状态</span>
                        <div className="flex items-center gap-2">
                            <span
                                className={`h-2 w-2 rounded-full ${
                                    backendConnected ? "bg-green-500" : "bg-red-500"
                                }`}
                            />
                            <span>{backendConnected ? "已连接" : "未连接"}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
