"use client";

import { useEffect, useMemo, useState } from "react";
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

interface PersistedSettings {
    engine: string;
    model: string;
}

const ENGINE_UI_META: Record<string, { displayName: string; description: string }> = {
    whisper: {
        displayName: "Whisper",
        description: "通用 Whisper 模型家族，兼顾多语种识别能力。",
    },
    whispercpp: {
        displayName: "Whisper.cpp",
        description: "whisper.cpp 使用的 GGML 模型，适合轻量本地推理。",
    },
    funasr: {
        displayName: "FunASR",
        description: "阿里 FunASR 模型家族，中文识别与热词效果更好。",
    },
    parakeet: {
        displayName: "Parakeet",
        description: "NVIDIA Parakeet 模型家族，需要 CUDA 环境。",
    },
};

function modelDisplayName(model: string): string {
    const names: Record<string, string> = {
        tiny: "tiny",
        base: "base",
        small: "small",
        medium: "medium",
        "large-v2": "large-v2",
        "large-v3": "large-v3",
        large: "large",
        "seaco-paraformer": "SeACo-Paraformer",
        "paraformer-zh": "Paraformer zh",
        "paraformer-zh-streaming": "Paraformer zh streaming",
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
    const [persistedSettings, setPersistedSettings] = useState<PersistedSettings | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

    const currentEngine = useMemo(
        () => engines.find((e) => e.name === selectedEngine),
        [engines, selectedEngine]
    );

    const getModelStatus = (engine: string, model: string): ModelStatus | undefined =>
        modelStatuses.find((s) => s.engine === engine && s.model === model);

    const getOrderedModels = (engine: string, models: string[]): string[] => {
        return [...models].sort((a, b) => {
            const aAvailable = getModelStatus(engine, a)?.available ? 1 : 0;
            const bAvailable = getModelStatus(engine, b)?.available ? 1 : 0;
            if (aAvailable !== bAvailable) return bAvailable - aAvailable;
            return a.localeCompare(b);
        });
    };

    const persistSelection = async (engine: string, model: string) => {
        if (typeof window === "undefined" || !window.electron) return;
        await window.electron.settings.update({ engine, model });
    };

    const fetchModelStatuses = async () => {
        if (typeof window === "undefined" || !window.electron) return;
        try {
            const statuses = await window.electron.backend.getModels();
            setModelStatuses(statuses);

            const hasDownloading = statuses.some((s: ModelStatus) => s.downloading);
            if (hasDownloading && !pollingInterval) {
                const interval = setInterval(() => {
                    void fetchModelStatuses();
                }, 1000);
                setPollingInterval(interval);
            } else if (!hasDownloading && pollingInterval) {
                clearInterval(pollingInterval);
                setPollingInterval(null);
            }
        } catch (err) {
            console.error("Failed to fetch model statuses:", err);
        }
    };

    const fetchEngines = async (preferred?: PersistedSettings | null) => {
        if (typeof window === "undefined" || !window.electron) return;
        try {
            const backendEngines = await window.electron.backend.getEngines();
            if (!backendEngines || backendEngines.length === 0) return;

            const mapped: Engine[] = backendEngines.map(
                (be: { name: string; models: string[]; loaded_model: string | null; available: boolean }) => {
                    const meta = ENGINE_UI_META[be.name] || { displayName: be.name, description: "" };
                    return { ...be, displayName: meta.displayName, description: meta.description };
                }
            );
            setEngines(mapped);

            const names = new Set(mapped.map((e) => e.name));
            const loadedEngine = mapped.find((e) => e.loaded_model)?.name;
            const firstAvailable = mapped.find((e) => e.available)?.name;
            const firstAny = mapped[0]?.name;

            const initialEngine =
                (preferred?.engine && names.has(preferred.engine) && preferred.engine) ||
                (selectedEngine && names.has(selectedEngine) && selectedEngine) ||
                loadedEngine ||
                firstAvailable ||
                firstAny ||
                "";

            if (initialEngine && initialEngine !== selectedEngine) {
                setSelectedEngine(initialEngine);
            }
        } catch (err) {
            console.error("Failed to fetch engines:", err);
        }
    };

    useEffect(() => {
        let active = true;

        const bootstrap = async () => {
            if (typeof window === "undefined" || !window.electron) return;

            try {
                const settings = await window.electron.settings.get();
                const preferred = {
                    engine: settings.engine || "funasr",
                    model: settings.model || "seaco-paraformer",
                };
                if (!active) return;
                setPersistedSettings(preferred);

                await Promise.all([fetchModelStatuses(), fetchEngines(preferred)]);
            } catch (err) {
                console.error("Failed to initialize engine settings:", err);
                await Promise.all([fetchModelStatuses(), fetchEngines(null)]);
            } finally {
                if (active) setIsReady(true);
            }
        };

        void bootstrap();

        return () => {
            active = false;
            if (pollingInterval) clearInterval(pollingInterval);
        };
    }, []);

    useEffect(() => {
        if (!currentEngine || currentEngine.models.length === 0) return;

        const modelSet = new Set(currentEngine.models);
        const preferredModel =
            persistedSettings?.engine === currentEngine.name ? persistedSettings.model : "";
        const ordered = getOrderedModels(currentEngine.name, currentEngine.models);

        const nextModel =
            (selectedModel && modelSet.has(selectedModel) && selectedModel) ||
            (preferredModel && modelSet.has(preferredModel) && preferredModel) ||
            (currentEngine.loaded_model && modelSet.has(currentEngine.loaded_model) && currentEngine.loaded_model) ||
            ordered[0] ||
            "";

        if (nextModel && nextModel !== selectedModel) {
            setSelectedModel(nextModel);
        }
    }, [currentEngine, modelStatuses, persistedSettings]);

    useEffect(() => {
        if (!isReady || !selectedEngine || !selectedModel) return;
        void persistSelection(selectedEngine, selectedModel);
    }, [isReady, selectedEngine, selectedModel]);

    const downloadModel = async (engine: string, model: string) => {
        try {
            await window.electron.backend.downloadModel(engine, model);
            await fetchModelStatuses();
        } catch (err) {
            console.error("Failed to download model:", err);
        }
    };

    const deleteModel = async (engine: string, model: string) => {
        try {
            await window.electron.backend.deleteModel(engine, model);
            await fetchModelStatuses();
        } catch (err) {
            console.error("Failed to delete model:", err);
        }
    };

    const formatBytes = (bytes: number): string => {
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    };

    const loadModel = async () => {
        if (!currentEngine || !selectedModel) return;
        setIsLoading(true);
        setLoadError(null);
        try {
            const result = await window.electron.backend.loadEngine(selectedEngine, selectedModel);
            if (result.error) {
                setLoadError(result.error);
                return;
            }
            await persistSelection(selectedEngine, selectedModel);
            await fetchEngines(persistedSettings);
        } catch (error) {
            setLoadError(String(error));
        } finally {
            setIsLoading(false);
        }
    };

    const engineModelStatuses = currentEngine
        ? getOrderedModels(currentEngine.name, currentEngine.models)
              .map((modelName) => getModelStatus(currentEngine.name, modelName))
              .filter((status): status is ModelStatus => Boolean(status))
        : [];

    return (
        <div className="space-y-6">
            <div className="space-y-4">
                <div>
                    <h3 className="text-lg font-medium">引擎</h3>
                </div>
                <div className="space-y-2">
                    <Label>选择引擎</Label>
                    <Select
                        value={selectedEngine}
                        onValueChange={(value) => {
                            setSelectedEngine(value);
                            setSelectedModel("");
                            setPersistedSettings((prev) =>
                                prev
                                    ? { ...prev, engine: value }
                                    : { engine: value, model: "" }
                            );
                        }}
                    >
                        <SelectTrigger className="w-[320px]">
                            <SelectValue placeholder="请选择引擎" />
                        </SelectTrigger>
                        <SelectContent>
                            {engines.map((engine) => (
                                <SelectItem key={engine.name} value={engine.name}>
                                    <span className="flex items-center gap-2">
                                        {engine.displayName}
                                        {!engine.available && (
                                            <span className="text-xs text-muted-foreground">(当前环境不可用)</span>
                                        )}
                                    </span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {currentEngine && <p className="text-sm text-muted-foreground">{currentEngine.description}</p>}
                </div>
            </div>

            <div className="space-y-4">
                <div>
                    <h3 className="text-lg font-medium">模型</h3>
                </div>
                <div className="space-y-2">
                    <Label>选择模型</Label>
                    <Select
                        value={selectedModel}
                        onValueChange={(value) => {
                            setSelectedModel(value);
                            setPersistedSettings((prev) =>
                                prev
                                    ? { ...prev, engine: selectedEngine || prev.engine, model: value }
                                    : { engine: selectedEngine, model: value }
                            );
                        }}
                    >
                        <SelectTrigger className="w-[320px]">
                            <SelectValue placeholder="请选择模型" />
                        </SelectTrigger>
                        <SelectContent>
                            {currentEngine
                                ? getOrderedModels(currentEngine.name, currentEngine.models).map((model) => (
                                      <SelectItem key={model} value={model}>
                                          <span className="flex items-center gap-2">
                                              {modelDisplayName(model)}
                                              {getModelStatus(currentEngine.name, model)?.available && (
                                                  <span className="text-xs text-green-600">已下载</span>
                                              )}
                                              {currentEngine.loaded_model === model && (
                                                  <Check className="h-3 w-3 text-green-500" />
                                              )}
                                          </span>
                                      </SelectItem>
                                  ))
                                : null}
                        </SelectContent>
                    </Select>
                    {currentEngine?.loaded_model && (
                        <p className="text-sm text-green-600">
                            当前已加载：{modelDisplayName(currentEngine.loaded_model)}
                        </p>
                    )}
                </div>

                <div className="space-y-2">
                    <Label>模型下载状态</Label>
                    {engineModelStatuses.length > 0 ? (
                        <div className="border rounded-md divide-y">
                            {engineModelStatuses.map((status) => (
                                <div key={status.model} className="flex items-center justify-between p-3">
                                    <span className="text-sm">{modelDisplayName(status.model)}</span>
                                    <div className="flex items-center gap-2">
                                        {status.downloading ? (
                                            <>
                                                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                                                {status.downloaded_bytes && status.size_bytes ? (
                                                    <span className="text-xs text-muted-foreground">
                                                        {formatBytes(status.downloaded_bytes)} /{" "}
                                                        {formatBytes(status.size_bytes)}
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
                                                {currentEngine && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => void deleteModel(currentEngine.name, status.model)}
                                                        title="删除模型"
                                                    >
                                                        <Trash2 className="h-4 w-4 text-red-500" />
                                                    </Button>
                                                )}
                                            </>
                                        ) : (
                                            currentEngine && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => void downloadModel(currentEngine.name, status.model)}
                                                    title="下载模型"
                                                >
                                                    <Download className="h-4 w-4 text-blue-500" />
                                                </Button>
                                            )
                                        )}
                                        {status.error && <span className="text-xs text-red-500">{status.error}</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-sm text-muted-foreground p-3 border rounded-md bg-muted/30">
                            后端暂未返回模型状态。
                        </div>
                    )}
                </div>
            </div>

            <div className="space-y-4">
                <div>
                    <h3 className="text-lg font-medium">加载所选模型</h3>
                </div>
                <div className="space-y-2">
                    <Button onClick={() => void loadModel()} disabled={isLoading || !currentEngine?.available}>
                        {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        {isLoading
                            ? "加载中..."
                            : currentEngine?.loaded_model === selectedModel
                              ? "已加载"
                              : "加载模型"}
                    </Button>
                    {loadError && <p className="text-sm text-red-500">{loadError}</p>}
                    <p className="text-sm text-muted-foreground">
                        首次加载可能会自动下载模型文件，耗时取决于模型大小和网络速度。
                    </p>
                </div>
            </div>
        </div>
    );
}
