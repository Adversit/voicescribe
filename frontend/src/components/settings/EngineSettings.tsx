"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Check, Download, Loader2, Trash2 } from "lucide-react";

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
    speakerModel: SpeakerModel;
}

type SpeakerModel = "cam++" | "eres2netv2" | "eres2net-large";
type BackendEngine = Pick<Engine, "name" | "models" | "loaded_model" | "available">;
const FIXED_SPEAKER_MODEL: SpeakerModel = "cam++";

const ENGINE_UI_META: Record<string, { displayName: string; description: string }> = {
    firered: {
        displayName: "FireRedASR",
        description: "适合中文实时与离线转录的 FireRed 系列模型。",
    },
    funasr: {
        displayName: "FunASR",
        description: "默认推荐，兼顾中文识别效果与流式能力。",
    },
    whisper: {
        displayName: "Whisper",
        description: "OpenAI Whisper 系列模型。",
    },
    whispercpp: {
        displayName: "Whisper.cpp",
        description: "适合 CPU 环境的 Whisper.cpp 部署。",
    },
    parakeet: {
        displayName: "Parakeet",
        description: "NVIDIA Parakeet 系列模型，需要 CUDA 环境。",
    },
    firered2: {
        displayName: "FireRedASR2",
        description: "FireRedASR2 系列模型。",
    },
    qwen3asr: {
        displayName: "Qwen3-ASR",
        description: "Qwen3-ASR 系列模型。",
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
        "cam++": "CAM++",
        eres2netv2: "ERes2NetV2",
        "eres2net-large": "ERes2Net-large",
    };
    return names[model] || model;
}

function formatBytes(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function EngineSettings() {
    const [selectedEngine, setSelectedEngine] = useState("");
    const [selectedModel, setSelectedModel] = useState("");
    const [selectedSpeakerModel] = useState<SpeakerModel>(FIXED_SPEAKER_MODEL);
    const [engines, setEngines] = useState<Engine[]>([]);
    const [modelStatuses, setModelStatuses] = useState<ModelStatus[]>([]);
    const [persistedSettings, setPersistedSettings] = useState<PersistedSettings | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const pollingRef = useRef<NodeJS.Timeout | null>(null);

    const currentEngine = useMemo(
        () => engines.find((engine) => engine.name === selectedEngine),
        [engines, selectedEngine],
    );

    const getModelStatus = (engine: string, model: string): ModelStatus | undefined =>
        modelStatuses.find((status) => status.engine === engine && status.model === model);

    const getOrderedModels = (engine: string, models: string[]): string[] => {
        return [...models].sort((left, right) => {
            const leftAvailable = getModelStatus(engine, left)?.available ? 1 : 0;
            const rightAvailable = getModelStatus(engine, right)?.available ? 1 : 0;
            if (leftAvailable !== rightAvailable) {
                return rightAvailable - leftAvailable;
            }
            return left.localeCompare(right);
        });
    };

    const persistEngineSelection = async (engine: string, model: string) => {
        if (!window.electron) return;
        await window.electron.settings.update({ engine, model });
    };

    const fetchModelStatuses = async () => {
        if (!window.electron) return;
        try {
            const statuses = await window.electron.backend.getModels();
            setModelStatuses(statuses);

            const hasDownloading = statuses.some((status: ModelStatus) => status.downloading);
            if (hasDownloading && !pollingRef.current) {
                pollingRef.current = setInterval(() => {
                    void fetchModelStatuses();
                }, 1000);
            } else if (!hasDownloading && pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
        } catch (error) {
            console.error("Failed to fetch model statuses:", error);
        }
    };

    const fetchEngines = async (preferred?: PersistedSettings | null) => {
        if (!window.electron) return;
        try {
            const backendEngines: BackendEngine[] = await window.electron.backend.getEngines();
            if (!backendEngines || backendEngines.length === 0) {
                return;
            }

            const mapped: Engine[] = backendEngines.map((engine: BackendEngine) => {
                const meta = ENGINE_UI_META[engine.name] || {
                    displayName: engine.name,
                    description: "",
                };
                return {
                    ...engine,
                    displayName: meta.displayName,
                    description: meta.description,
                };
            });

            setEngines(mapped);

            const names = new Set(mapped.map((engine) => engine.name));
            const loadedEngine = mapped.find((engine) => engine.loaded_model)?.name;
            const firstAvailable = mapped.find((engine) => engine.available)?.name;
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
        } catch (error) {
            console.error("Failed to fetch engines:", error);
        }
    };

    useEffect(() => {
        let active = true;

        const bootstrap = async () => {
            if (!window.electron) return;

            try {
                const settings = await window.electron.settings.get();
                const preferred: PersistedSettings = {
                    engine: settings.engine || "firered",
                    model: settings.model || "firered-aed-l",
                    speakerModel: FIXED_SPEAKER_MODEL,
                };

                if (!active) return;
                setPersistedSettings(preferred);

                await Promise.all([fetchModelStatuses(), fetchEngines(preferred)]);
            } catch (error) {
                console.error("Failed to initialize engine settings:", error);
                await Promise.all([fetchModelStatuses(), fetchEngines(null)]);
            } finally {
                if (active) {
                    setIsReady(true);
                }
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
        if (!currentEngine || currentEngine.models.length === 0) {
            return;
        }

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
    }, [currentEngine, modelStatuses, persistedSettings, selectedModel]);

    useEffect(() => {
        if (!isReady || !selectedEngine || !selectedModel) {
            return;
        }
        void persistEngineSelection(selectedEngine, selectedModel);
    }, [isReady, selectedEngine, selectedModel]);

    const downloadModel = async (engine: string, model: string) => {
        try {
            await window.electron.backend.downloadModel(engine, model);
            await fetchModelStatuses();
        } catch (error) {
            console.error("Failed to download model:", error);
        }
    };

    const deleteModel = async (engine: string, model: string) => {
        try {
            await window.electron.backend.deleteModel(engine, model);
            await fetchModelStatuses();
        } catch (error) {
            console.error("Failed to delete model:", error);
        }
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
            await persistEngineSelection(selectedEngine, selectedModel);
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

    const speakerModelStatuses = [
        {
            model: FIXED_SPEAKER_MODEL,
            status: getModelStatus("speaker", FIXED_SPEAKER_MODEL),
        },
    ];

    return (
        <div className="space-y-6">
            <div className="space-y-4">
                <div>
                    <h3 className="text-lg font-medium">语音转录模型</h3>
                </div>

                <div className="space-y-2">
                    <Label>转录引擎</Label>
                    <Select
                        value={selectedEngine}
                        onValueChange={(value) => {
                            setSelectedEngine(value);
                            setSelectedModel("");
                            setPersistedSettings((prev) =>
                                prev
                                    ? { ...prev, engine: value }
                                    : { engine: value, model: "", speakerModel: selectedSpeakerModel },
                            );
                        }}
                    >
                        <SelectTrigger className="w-[320px]">
                            <SelectValue placeholder="选择转录引擎" />
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

                <div className="space-y-2">
                    <Label>引擎模型</Label>
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
                                      },
                            );
                        }}
                    >
                        <SelectTrigger className="w-[320px]">
                            <SelectValue placeholder="选择引擎模型" />
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

                    <div className="space-y-2 pt-2">
                        <Button onClick={() => void loadModel()} disabled={isLoading || !currentEngine?.available}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {isLoading
                                ? "正在加载模型..."
                                : currentEngine?.loaded_model === selectedModel
                                  ? "重新加载模型"
                                  : "加载模型"}
                        </Button>
                        {loadError && <p className="text-sm text-red-500">{loadError}</p>}
                        <p className="text-sm text-muted-foreground">
                            加载模型按钮只会加载当前选中的 ASR 模型，不会切换说话人识别模型。
                        </p>
                    </div>
                </div>

                <div className="space-y-2">
                    <Label>说话人模型</Label>
                    <Select value={selectedSpeakerModel} disabled>
                        <SelectTrigger className="w-[320px]">
                            <SelectValue placeholder="CAM++" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={selectedSpeakerModel}>
                                <span className="flex items-center gap-2">
                                    {speakerModelDisplayName(selectedSpeakerModel)}
                                    <Check className="h-3 w-3 text-green-500" />
                                </span>
                            </SelectItem>
                        </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground">
                        当前版本固定使用 CAM++ 作为说话人识别模型，前端暂不提供切换入口。
                    </p>
                </div>

                <div className="space-y-2">
                    <Label>说话人模型文件</Label>
                    <div className="divide-y rounded-md border">
                        {speakerModelStatuses.map(({ model, status }) => (
                            <div key={model} className="flex items-center justify-between p-3">
                                <span className="text-sm">{speakerModelDisplayName(model)}</span>
                                <div className="flex items-center gap-2">
                                    {status?.downloading ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                                            {status.downloaded_bytes && status.size_bytes ? (
                                                <span className="text-xs text-muted-foreground">
                                                    {formatBytes(status.downloaded_bytes)} /{" "}
                                                    {formatBytes(status.size_bytes)}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">Downloading...</span>
                                            )}
                                        </>
                                    ) : status?.available ? (
                                        <>
                                            {status.size_bytes && (
                                                <span className="text-xs text-muted-foreground">
                                                    {formatBytes(status.size_bytes)}
                                                </span>
                                            )}
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => void deleteModel("speaker", model)}
                                                title="删除模型"
                                            >
                                                <Trash2 className="h-4 w-4 text-red-500" />
                                            </Button>
                                        </>
                                    ) : (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => void downloadModel("speaker", model)}
                                            title="下载模型"
                                        >
                                            <Download className="h-4 w-4 text-blue-500" />
                                        </Button>
                                    )}
                                    {status?.error && (
                                        <span className="text-xs text-red-500">{status.error}</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
