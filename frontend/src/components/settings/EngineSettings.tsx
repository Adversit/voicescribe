"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
    speakerModel: "cam++" | "eres2netv2" | "eres2net-large";
}

const ENGINE_UI_META: Record<string, { displayName: string; description: string }> = {
    firered: {
        displayName: "FireRedASR",
        description: "中文识别精度优先，适合离线高质量转写。",
    },
    funasr: {
        displayName: "FunASR",
        description: "中文识别与热词支持好，支持说话人识别。",
    },
    whisper: {
        displayName: "Whisper",
        description: "通用多语种模型，稳定性较好。",
    },
    whispercpp: {
        displayName: "Whisper.cpp",
        description: "轻量本地推理，资源占用较低。",
    },
    parakeet: {
        displayName: "Parakeet",
        description: "NVIDIA 模型，通常需要 CUDA 环境。",
    },
    firered2: {
        displayName: "FireRedASR2",
        description: "FireRedASR2 models are registered for download and local path management.",
    },
    qwen3asr: {
        displayName: "Qwen3-ASR",
        description: "Qwen3-ASR models are registered for download and local path management.",
    },
};

const SPEAKER_MODEL_OPTIONS: Array<"cam++" | "eres2netv2" | "eres2net-large"> = [
    "cam++",
    "eres2netv2",
    "eres2net-large",
];

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
        "firered-aed-l": "FireRedASR-AED-L (1.1B)",
        "fireredasr2-aed": "FireRedASR2-AED",
        "fireredasr2-llm": "FireRedASR2-LLM",
        "qwen3-asr-0.6b": "Qwen3-ASR-0.6B",
        "qwen3-asr-1.7b": "Qwen3-ASR-1.7B",
    };
    return names[model] || model;
}

function speakerModelDisplayName(model: string): string {
    const names: Record<string, string> = {
        "cam++": "CAM++ (默认)",
        "eres2netv2": "ERes2NetV2",
        "eres2net-large": "ERes2Net-large",
    };
    return names[model] || model;
}

export function EngineSettings() {
    const [selectedEngine, setSelectedEngine] = useState("");
    const [selectedModel, setSelectedModel] = useState("");
    const [selectedSpeakerModel, setSelectedSpeakerModel] = useState<
        "cam++" | "eres2netv2" | "eres2net-large"
    >("cam++");
    const [loadedSpeakerModel, setLoadedSpeakerModel] = useState<string | null>(null);
    const [engines, setEngines] = useState<Engine[]>([]);
    const [modelStatuses, setModelStatuses] = useState<ModelStatus[]>([]);
    const [persistedSettings, setPersistedSettings] = useState<PersistedSettings | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const pollingRef = useRef<NodeJS.Timeout | null>(null);

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

    const refreshLoadedSpeakerModel = async () => {
        if (typeof window === "undefined" || !window.electron) return;
        try {
            const health = await window.electron.backend.checkHealth();
            setLoadedSpeakerModel(health?.speaker_model || null);
        } catch (err) {
            console.error("Failed to refresh loaded speaker model:", err);
        }
    };

    const fetchModelStatuses = async () => {
        if (typeof window === "undefined" || !window.electron) return;
        try {
            const statuses = await window.electron.backend.getModels();
            setModelStatuses(statuses);

            const hasDownloading = statuses.some((s: ModelStatus) => s.downloading);
            if (hasDownloading && !pollingRef.current) {
                pollingRef.current = setInterval(() => {
                    void fetchModelStatuses();
                }, 1000);
            } else if (!hasDownloading && pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
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
                (be: {
                    name: string;
                    models: string[];
                    loaded_model: string | null;
                    available: boolean;
                }) => {
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
                const preferred: PersistedSettings = {
                    engine: settings.engine || "firered",
                    model: settings.model || "firered-aed-l",
                    speakerModel: settings.speakerModel || "cam++",
                };
                if (!active) return;
                setPersistedSettings(preferred);
                setSelectedSpeakerModel(preferred.speakerModel);

                await Promise.all([
                    fetchModelStatuses(),
                    fetchEngines(preferred),
                    refreshLoadedSpeakerModel(),
                ]);
            } catch (err) {
                console.error("Failed to initialize engine settings:", err);
                await Promise.all([fetchModelStatuses(), fetchEngines(null), refreshLoadedSpeakerModel()]);
            } finally {
                if (active) setIsReady(true);
            }
        };

        void bootstrap();

        return () => {
            active = false;
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
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
            (currentEngine.loaded_model &&
                modelSet.has(currentEngine.loaded_model) &&
                currentEngine.loaded_model) ||
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
            await refreshLoadedSpeakerModel();
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

    const speakerModelStatuses = getOrderedModels(
        "speaker",
        SPEAKER_MODEL_OPTIONS as unknown as string[]
    )
        .map((modelName) => getModelStatus("speaker", modelName))
        .filter((status): status is ModelStatus => Boolean(status));

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
                                    : { engine: value, model: "", speakerModel: selectedSpeakerModel }
                            );
                        }}
                    >
                        <SelectTrigger className="w-[320px]">
                            <SelectValue placeholder="请选择引擎" />
                        </SelectTrigger>
                        <SelectContent>
                            {engines.map((engine) => (
                                <SelectItem key={engine.name} value={engine.name}>
                                    {engine.displayName}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {currentEngine && (
                        <p className="text-sm text-muted-foreground">{currentEngine.description}</p>
                    )}
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
                                    : {
                                          engine: selectedEngine || "firered",
                                          model: value,
                                          speakerModel: selectedSpeakerModel,
                                      }
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
                                                        onClick={() =>
                                                            void deleteModel(currentEngine.name, status.model)
                                                        }
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
                                                    onClick={() =>
                                                        void downloadModel(currentEngine.name, status.model)
                                                    }
                                                    title="下载模型"
                                                >
                                                    <Download className="h-4 w-4 text-blue-500" />
                                                </Button>
                                            )
                                        )}
                                        {status.error && (
                                            <span className="text-xs text-red-500">{status.error}</span>
                                        )}
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
                    <h3 className="text-lg font-medium">说话人识别模型</h3>
                </div>
                <div className="space-y-2">
                    <Label>选择说话人模型</Label>
                    <Select
                        value={selectedSpeakerModel}
                        onValueChange={(value: "cam++" | "eres2netv2" | "eres2net-large") => {
                            setSelectedSpeakerModel(value);
                            setPersistedSettings((prev) =>
                                prev
                                    ? { ...prev, speakerModel: value }
                                    : {
                                          engine: selectedEngine || "firered",
                                          model: selectedModel || "firered-aed-l",
                                          speakerModel: value,
                                      }
                            );
                            void window.electron.settings.update({ speakerModel: value }).then(() => {
                                void refreshLoadedSpeakerModel();
                            });
                        }}
                    >
                        <SelectTrigger className="w-[320px]">
                            <SelectValue placeholder="请选择说话人模型" />
                        </SelectTrigger>
                        <SelectContent>
                            {SPEAKER_MODEL_OPTIONS.map((model) => (
                                <SelectItem key={model} value={model}>
                                    {speakerModelDisplayName(model)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground">
                        该选项会影响离线说话人识别和流式说话人匹配，切换后自动重载模型。
                    </p>
                </div>

                <div className="space-y-2">
                    <Label>说话人模型下载状态</Label>
                    {speakerModelStatuses.length > 0 ? (
                        <div className="border rounded-md divide-y">
                            {speakerModelStatuses.map((status) => (
                                <div key={status.model} className="flex items-center justify-between p-3">
                                    <span className="text-sm">{speakerModelDisplayName(status.model)}</span>
                                    <div className="flex items-center gap-2">
                                        {loadedSpeakerModel === status.model && (
                                            <Check className="h-3 w-3 text-green-500" />
                                        )}
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
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => void deleteModel("speaker", status.model)}
                                                    title="删除模型"
                                                >
                                                    <Trash2 className="h-4 w-4 text-red-500" />
                                                </Button>
                                            </>
                                        ) : (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => void downloadModel("speaker", status.model)}
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
                    ) : (
                        <div className="text-sm text-muted-foreground p-3 border rounded-md bg-muted/30">
                            后端暂未返回说话人模型状态。
                        </div>
                    )}
                    {loadedSpeakerModel && (
                        <p className="text-sm text-green-600">
                            当前已加载：{speakerModelDisplayName(loadedSpeakerModel)}
                        </p>
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

