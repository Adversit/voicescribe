"use client";

import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
    enableDiarization: boolean;
    enableAIRefine: boolean;
}

export function GeneralSettings() {
    const [config, setConfig] = useState<GeneralConfig>({
        language: "zh",
        outputMode: "clipboard",
        enableDiarization: false,
        enableAIRefine: false,
    });
    const [backendConnected, setBackendConnected] = useState(false);
    const [appVersion, setAppVersion] = useState("0.0.0");

    useEffect(() => {
        const loadSettings = async () => {
            if (typeof window !== 'undefined' && window.electron) {
                try {
                    const settings = await window.electron.settings.get();
                    setConfig({
                        language: settings.language || 'zh',
                        outputMode: settings.outputFormat || 'clipboard',
                        enableDiarization: settings.enableDiarization || false,
                        enableAIRefine: settings.enableAiRefine || false,
                    });
                } catch (err) {
                    console.error('Failed to load settings:', err);
                }

                try {
                    const version = await window.electron.app.getVersion();
                    setAppVersion(version);
                } catch (err) {
                    console.error('Failed to get app version:', err);
                }
            }
        };
        loadSettings();
        checkBackendConnection();
    }, []);

    const checkBackendConnection = async () => {
        if (typeof window !== 'undefined' && window.electron) {
            try {
                const result = await window.electron.backend.checkHealth();
                setBackendConnected(result.healthy);
            } catch {
                setBackendConnected(false);
            }
        } else {
            try {
                const res = await fetch("http://127.0.0.1:8765/health");
                setBackendConnected(res.ok);
            } catch {
                setBackendConnected(false);
            }
        }
    };

    const updateConfig = (updates: Partial<GeneralConfig>) => {
        const newConfig = { ...config, ...updates };
        setConfig(newConfig);
        if (typeof window !== 'undefined' && window.electron) {
            const settingsUpdate: Record<string, unknown> = {};
            if (updates.language !== undefined) settingsUpdate.language = updates.language;
            if (updates.outputMode !== undefined) settingsUpdate.outputFormat = updates.outputMode;
            if (updates.enableDiarization !== undefined) settingsUpdate.enableDiarization = updates.enableDiarization;
            if (updates.enableAIRefine !== undefined) settingsUpdate.enableAiRefine = updates.enableAIRefine;
            window.electron.settings.update(settingsUpdate);
        }
    };

    return (
        <div className="space-y-6">
            {/* Language Section */}
            <div className="space-y-4">
                <div>
                    <h3 className="text-lg font-medium">语言</h3>
                </div>
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

            {/* Output Mode Section */}
            <div className="space-y-4">
                <div>
                    <h3 className="text-lg font-medium">输出方式</h3>
                </div>
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
                </div>

                {config.outputMode !== "clipboard" && (
                    <div className="flex items-center gap-2 p-3 rounded-md bg-muted">
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                        <span className="text-sm">Windows 无需额外权限配置</span>
                    </div>
                )}
            </div>

            {/* Other Settings Section */}
            <div className="space-y-4">
                <div>
                    <h3 className="text-lg font-medium">其他</h3>
                </div>
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <Label htmlFor="diarization">启用说话人识别</Label>
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
                            {config.enableAIRefine && (
                                <p className="text-xs text-muted-foreground">
                                    AI 优化将去除语气词、修正错别字
                                </p>
                            )}
                        </div>
                        <Switch
                            id="ai-refine"
                            checked={config.enableAIRefine}
                            onCheckedChange={(checked) =>
                                updateConfig({ enableAIRefine: checked })
                            }
                        />
                    </div>
                </div>
            </div>

            {/* About Section */}
            <div className="space-y-4">
                <div>
                    <h3 className="text-lg font-medium">关于</h3>
                </div>
                <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">版本</span>
                        <span>{appVersion}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">后端状态</span>
                        <div className="flex items-center gap-2">
                            <span
                                className={`h-2 w-2 rounded-full ${backendConnected ? "bg-green-500" : "bg-red-500"
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
