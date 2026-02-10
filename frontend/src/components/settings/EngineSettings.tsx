"use client";

import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Loader2, Check, Download, Trash2 } from "lucide-react";

interface Engine {
    name: string;
    displayName: string;
    description: string;
    models: string[];
    available: boolean;
    loaded_model: string | null;
}

interface ModelStatus {
    engine: string;
    model: string;
    available: boolean;
    downloading: boolean;
    size_bytes?: number;
    downloaded_bytes?: number;
    error?: string;
}

// Display names and descriptions for engines (backend doesn't return these)
const ENGINE_UI_META: Record<string, { displayName: string; description: string }> = {
    whisper: {
        displayName: "Whisper (faster-whisper)",
        description: "OpenAI Whisper 模型，通过 faster-whisper 优化",
    },
    whispercpp: {
        displayName: "Whisper.cpp",
        description: "C++ 优化的 Whisper 实现",
    },
    funasr: {
        displayName: "FunASR",
        description: "阿里达摩院语音识别引擎，支持热词增强",
    },
    parakeet: {
        displayName: "Parakeet",
        description: "NVIDIA NeMo 引擎，需要 GPU",
    },
};

function modelDisplayName(model: string): string {
    const names: Record<string, string> = {
        tiny: "tiny (最快)",
        base: "base",
        small: "small",
        medium: "medium (推荐)",
        "large-v2": "large-v2",
        "large-v3": "large-v3 (最准)",
        large: "large",
        "seaco-paraformer": "SeACo-Paraformer (热词增强)",
        "paraformer-zh": "Paraformer 中文",
        "paraformer-zh-streaming": "Paraformer 流式",
        "sensevoice-small": "SenseVoice Small",
        "parakeet-ctc-1.1b": "Parakeet CTC 1.1B",
        "parakeet-tdt-1.1b": "Parakeet TDT 1.1B",
    };
    return names[model] || model;
}

export function EngineSettings() {
    const [selectedEngine, setSelectedEngine] = useState("");
    const [selectedModel, setSelectedModel] = useState("");
    const [engines, setEngines] = useState<Engine[]>([]);
    const [modelStatuses, setModelStatuses] = useState<ModelStatus[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

    const currentEngine = engines.find((e) => e.name === selectedEngine);

    useEffect(() => {
        fetchEngines();
        fetchModelStatuses();
        
        // Cleanup polling on unmount
        return () => {
            if (pollingInterval) {
                clearInterval(pollingInterval);
            }
        };
    }, []);

    useEffect(() => {
        // Reset model when engine changes
        if (currentEngine && currentEngine.models.length > 0) {
            if (currentEngine.loaded_model) {
                setSelectedModel(currentEngine.loaded_model);
            } else {
                // Use first model as default
                setSelectedModel(currentEngine.models[0]);
            }
        }
    }, [selectedEngine, currentEngine]);

    const fetchEngines = async () => {
        if (typeof window !== 'undefined' && window.electron) {
            try {
                const backendEngines = await window.electron.backend.getEngines();
                if (backendEngines && backendEngines.length > 0) {
                    const mappedEngines = backendEngines.map((be: { name: string; models: string[]; loaded_model: string | null; available: boolean }) => {
                        const meta = ENGINE_UI_META[be.name] || {
                            displayName: be.name,
                            description: "",
                        };
                        return {
                            ...be,
                            displayName: meta.displayName,
                            description: meta.description,
                        };
                    });
                    setEngines(mappedEngines);
                    
                    // Set default engine to first available engine
                    const firstAvailable = mappedEngines.find((e: Engine) => e.available);
                    if (firstAvailable && !selectedEngine) {
                        setSelectedEngine(firstAvailable.name);
                    }
                }
            } catch (err) {
                console.error('Failed to fetch engines:', err);
            }
        }
    };

    const fetchModelStatuses = async () => {
        if (typeof window !== 'undefined' && window.electron) {
            try {
                const statuses = await window.electron.backend.getModels();
                console.log('[EngineSettings] Model statuses:', statuses);
                setModelStatuses(statuses);
                
                // Start/stop polling based on downloading status
                const hasDownloading = statuses.some((s: ModelStatus) => s.downloading);
                if (hasDownloading && !pollingInterval) {
                    console.log('[EngineSettings] Starting polling (models downloading)');
                    const interval = setInterval(() => {
                        fetchModelStatuses();
                    }, 1000);
                    setPollingInterval(interval);
                } else if (!hasDownloading && pollingInterval) {
                    console.log('[EngineSettings] Stopping polling (no downloads)');
                    clearInterval(pollingInterval);
                    setPollingInterval(null);
                }
            } catch (err) {
                console.error('[EngineSettings] Failed to fetch model statuses:', err);
            }
        }
    };

    const getModelStatus = (engine: string, model: string): ModelStatus | undefined => {
        const status = modelStatuses.find(s => s.engine === engine && s.model === model);
        console.log(`[EngineSettings] Status for ${engine}:${model}:`, status);
        return status;
    };

    const downloadModel = async (engine: string, model: string) => {
        console.log(`[EngineSettings] Downloading model: ${engine}:${model}`);
        try {
            const result = await window.electron.backend.downloadModel(engine, model);
            console.log('[EngineSettings] Download started:', result);
            await fetchModelStatuses();
        } catch (err) {
            console.error('[EngineSettings] Failed to download model:', err);
        }
    };

    const deleteModel = async (engine: string, model: string) => {
        console.log(`[EngineSettings] Deleting model: ${engine}:${model}`);
        try {
            const result = await window.electron.backend.deleteModel(engine, model);
            console.log('[EngineSettings] Delete completed:', result);
            await fetchModelStatuses();
        } catch (err) {
            console.error('[EngineSettings] Failed to delete model:', err);
        }
    };

    const formatBytes = (bytes: number): string => {
        if (bytes < 1024 * 1024) {
            return `${(bytes / 1024).toFixed(1)} KB`;
        } else if (bytes < 1024 * 1024 * 1024) {
            return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        } else {
            return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
        }
    };

    const loadModel = async () => {
        setIsLoading(true);
        setLoadError(null);
        try {
            if (typeof window !== 'undefined' && window.electron) {
                const result = await window.electron.backend.loadEngine(selectedEngine, selectedModel);
                if (result.error) {
                    setLoadError(result.error);
                } else {
                    // Refresh engines to get updated loaded_model state
                    await fetchEngines();
                }
            }
        } catch (error) {
            setLoadError(String(error));
        } finally {
            setIsLoading(false);
        }
    };

    const getModelDescription = () => {
        switch (selectedEngine) {
            case "whisper":
            case "whispercpp":
                return "tiny/base: 速度快但准确率较低\nmedium: 速度与准确率平衡\nlarge: 最准确但较慢";
            case "funasr":
                return "SeACo-Paraformer: 热词增强，推荐使用热词时选择\nParaformer: 标准中文识别\nSenseVoice: 支持更多语种";
            case "parakeet":
                return "需要 NVIDIA GPU，主要针对英文优化";
            default:
                return "";
        }
    };

    return (
        <div className="space-y-6">
            {/* Engine Selection */}
            <div className="space-y-4">
                <div>
                    <h3 className="text-lg font-medium">引擎</h3>
                </div>
                <div className="space-y-2">
                    <Label>选择引擎</Label>
                    <Select value={selectedEngine} onValueChange={setSelectedEngine}>
                        <SelectTrigger className="w-[280px]">
                            <SelectValue placeholder="选择引擎" />
                        </SelectTrigger>
                        <SelectContent>
                            {engines.map((engine) => (
                                <SelectItem key={engine.name} value={engine.name}>
                                    <span className="flex items-center gap-2">
                                        {engine.displayName}
                                        {!engine.available && (
                                            <span className="text-xs text-muted-foreground">
                                                (未安装)
                                            </span>
                                        )}
                                    </span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {currentEngine && (
                        <p className="text-sm text-muted-foreground">
                            {currentEngine.description}
                        </p>
                    )}
                    {engines.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                            正在从后端获取引擎列表...
                        </p>
                    )}
                </div>
            </div>

            {/* Model Selection */}
            <div className="space-y-4">
                <div>
                    <h3 className="text-lg font-medium">模型</h3>
                </div>
                <div className="space-y-2">
                    <Label>选择模型</Label>
                    <Select value={selectedModel} onValueChange={setSelectedModel}>
                        <SelectTrigger className="w-[280px]">
                            <SelectValue placeholder="选择模型" />
                        </SelectTrigger>
                        <SelectContent>
                            {currentEngine?.models.map((model) => (
                                <SelectItem key={model} value={model}>
                                    <span className="flex items-center gap-2">
                                        {modelDisplayName(model)}
                                        {currentEngine.loaded_model === model && (
                                            <Check className="h-3 w-3 text-green-500" />
                                        )}
                                    </span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground whitespace-pre-line">
                        {getModelDescription()}
                    </p>
                    {currentEngine?.loaded_model && (
                        <p className="text-sm text-green-600">
                            当前已加载: {modelDisplayName(currentEngine.loaded_model)}
                        </p>
                    )}
                </div>

                {/* Model Management - Show all models from backend */}
                {selectedEngine === "funasr" && currentEngine && modelStatuses.length > 0 ? (
                    <div className="space-y-2">
                        <Label>模型管理</Label>
                        <div className="border rounded-md divide-y">
                            {modelStatuses
                                .filter(status => status.engine === "funasr")
                                .map((status) => (
                                    <div key={status.model} className="flex items-center justify-between p-3">
                                        <span className="text-sm">{modelDisplayName(status.model)}</span>
                                        <div className="flex items-center gap-2">
                                            {status.downloading ? (
                                                <>
                                                    <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                                                    {status.downloaded_bytes && status.size_bytes ? (
                                                        <span className="text-xs text-muted-foreground">
                                                            {formatBytes(status.downloaded_bytes)} / {formatBytes(status.size_bytes)}
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">下载中...</span>
                                                    )}
                                                </>
                                            ) : status.available ? (
                                                <>
                                                    {status.size_bytes && (
                                                        <span className="text-xs text-muted-foreground">
                                                            {formatBytes(status.size_bytes)}
                                                        </span>
                                                    )}
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => deleteModel("funasr", status.model)}
                                                        title="删除模型"
                                                    >
                                                        <Trash2 className="h-4 w-4 text-red-500" />
                                                    </Button>
                                                </>
                                            ) : (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => downloadModel("funasr", status.model)}
                                                    title="下载模型"
                                                >
                                                    <Download className="h-4 w-4 text-blue-500" />
                                                </Button>
                                            )}
                                            {status.error && (
                                                <span className="text-xs text-red-500">{status.error}</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                        </div>
                    </div>
                ) : selectedEngine === "funasr" && currentEngine ? (
                    <div className="space-y-2">
                        <Label>模型管理</Label>
                        <div className="text-sm text-muted-foreground p-3 border rounded-md bg-muted/30">
                            正在加载模型状态...
                        </div>
                    </div>
                ) : selectedEngine && currentEngine ? (
                    <div className="space-y-2">
                        <Label>模型管理</Label>
                        <div className="text-sm text-muted-foreground p-3 border rounded-md bg-muted/30">
                            该引擎模型由系统自动管理
                        </div>
                    </div>
                ) : null}
            </div>

            {/* Load Model */}
            <div className="space-y-4">
                <div>
                    <h3 className="text-lg font-medium">加载模型</h3>
                </div>
                <div className="space-y-2">
                    <Button
                        onClick={loadModel}
                        disabled={isLoading || !currentEngine?.available}
                    >
                        {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        {isLoading ? "加载中..." : currentEngine?.loaded_model === selectedModel ? "重新加载" : "加载模型"}
                    </Button>
                    {loadError && (
                        <p className="text-sm text-red-500">{loadError}</p>
                    )}
                    <p className="text-sm text-muted-foreground">
                        首次加载模型时会自动下载，请耐心等待
                    </p>
                </div>
            </div>
        </div>
    );
}
