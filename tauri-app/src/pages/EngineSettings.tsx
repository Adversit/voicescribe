import { useEffect, useMemo, useState } from "react";
import { loadEngineSelection } from "../api/backend";
import {
  deleteModelDownloadToken,
  getModelDownloadToken,
  saveModelDownloadToken,
} from "../api/tauri";
import { TokenPromptDialog } from "../components/TokenPromptDialog";
import {
  SettingsField,
  SettingsPage,
  SettingsSection,
  dangerButtonClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
  selectClassName,
} from "../components/settings-ui";
import { useAppStore } from "../stores/appStore";
import { useModelStore } from "../stores/modelStore";
import type { EngineSelection, ModelCategory, ModelStatus } from "../types";

const engineDescriptions: Record<string, string> = {
  whisper: "OpenAI Whisper，多语言通用引擎。",
  whispercpp: "whisper.cpp CLI，适合独立轻量部署。",
  funasr: "阿里 FunASR，支持内置或外部分离路径。",
  qwen3_asr: "Qwen3-ASR 独立引擎，默认走外部分离与映射组合。",
  parakeet: "NVIDIA Parakeet，当前进入矩阵但说话人文本对齐能力受限。",
};

function formatBytes(value: number | null) {
  if (!value) {
    return "—";
  }
  const gb = 1024 * 1024 * 1024;
  const mb = 1024 * 1024;
  const formatter = new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  if (value >= gb) {
    return `${formatter.format(value / gb)} GB`;
  }

  return `${formatter.format(value / mb)} MB`;
}

function defaultSelectionForEngine(engine: string): EngineSelection {
  switch (engine) {
    case "qwen3_asr":
      return {
        asrModel: "qwen3-asr-1.7b",
        diarizationModel: "3d-speaker",
        speakerMappingModel: "campp",
      };
    case "whisper":
      return {
        asrModel: "large-v3",
        diarizationModel: "3d-speaker",
        speakerMappingModel: "campp",
      };
    case "whispercpp":
      return {
        asrModel: "base",
        diarizationModel: "3d-speaker",
        speakerMappingModel: "campp",
      };
    case "parakeet":
      return {
        asrModel: "parakeet-ctc-1.1b",
        diarizationModel: "3d-speaker",
        speakerMappingModel: "campp",
      };
    case "funasr":
    default:
      return {
        asrModel: "seaco-paraformer",
        diarizationModel: "funasr_builtin",
        speakerMappingModel: "campp",
      };
  }
}

function getDefaultModelStatus(category: ModelCategory, engine: string, model: string): ModelStatus {
  const bucket = category === "asr" ? engine : category;
  return {
    category,
    engine: bucket,
    model,
    display_name: model,
    engine_scope: category === "asr" ? [engine] : [engine],
    available: false,
    downloadable: true,
    requires_token: false,
    downloading: false,
    loaded: false,
    size_bytes: null,
    downloaded_bytes: null,
    error: null,
  };
}

function renderStatus(model: ModelStatus) {
  if (model.downloading) {
    return "下载中";
  }
  if (model.loaded) {
    return "已加载";
  }
  return model.available ? "已下载" : "未下载";
}

type ModelSectionProps = {
  title: string;
  description: string;
  category: ModelCategory;
  selectedValue: string;
  selectedLabel?: string;
  invalidReason?: string | null;
  options: string[];
  displayModels: ModelStatus[];
  onSelect: (value: string) => void;
  onDownload: (model: ModelStatus) => void;
  onDelete: (model: ModelStatus) => void;
};

function ModelSection(props: ModelSectionProps) {
  const {
    title,
    description,
    category,
    selectedValue,
    selectedLabel,
    invalidReason,
    options,
    displayModels,
    onSelect,
    onDownload,
    onDelete,
  } = props;

  const resolvedOptions = options.includes(selectedValue) || !selectedValue
    ? options
    : [selectedValue, ...options];

  return (
    <SettingsSection
      title={title}
      description={description}
      actions={<span className="app-chip">{displayModels.length} 个模型</span>}
    >
      <SettingsField label={`当前${title}`}>
        <select
          value={selectedValue}
          onChange={(event) => onSelect(event.target.value)}
          className={`${selectClassName} ${invalidReason ? "border-[#c53030] text-[#9b2c2c]" : ""}`}
        >
          {resolvedOptions.map((model) => (
            <option key={model} value={model}>
              {model === selectedValue && invalidReason && !options.includes(model)
                ? `${selectedLabel ?? displayModels.find((item) => item.model === model)?.display_name ?? model}（当前失效）`
                : (displayModels.find((item) => item.model === model)?.display_name ?? model)}
            </option>
          ))}
        </select>
        {invalidReason ? <div className="mt-2 text-xs text-[#9b2c2c]">当前选择失效：{invalidReason}</div> : null}
      </SettingsField>

      <div className="mt-4 list-scroll space-y-2">
        {displayModels.map((model) => (
          <div
            key={`${category}-${model.engine}-${model.model}`}
            className={`rounded-[12px] bg-panel px-3.5 py-3 ${
              model.model === selectedValue && invalidReason
                ? "border border-[#c53030] bg-[#fff5f5]"
                : "border border-line"
            }`}
          >
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className={`truncate text-sm font-semibold ${model.model === selectedValue && invalidReason ? "text-[#9b2c2c]" : "text-ink"}`}>
                  {model.display_name}
                </div>
                <div className={`mt-1 text-xs ${model.model === selectedValue && invalidReason ? "text-[#9b2c2c]" : "text-ink/58"}`}>
                  状态：{renderStatus(model)}
                </div>
                <div className={`mt-0.5 text-xs ${model.model === selectedValue && invalidReason ? "text-[#9b2c2c]" : "text-ink/46"}`}>
                  大小：{formatBytes(model.size_bytes)} · 已下载：{formatBytes(model.downloaded_bytes)}
                </div>
                {model.requires_token ? <div className="mt-1 text-xs text-ink/46">下载需要 token</div> : null}
                {model.error ? <div className="mt-1 text-xs text-[#9c4221]">{model.error}</div> : null}
                {model.model === selectedValue && invalidReason ? (
                  <div className="mt-1 text-xs text-[#9b2c2c]">当前选择失效，需要手动修复或重新选择。</div>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {model.available && model.downloadable ? (
                  <button type="button" onClick={() => onDelete(model)} className={dangerButtonClassName}>
                    删除
                  </button>
                ) : model.available ? (
                  <span className="app-chip">内置</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onDownload(model)}
                    className={primaryButtonClassName}
                    disabled={model.downloading || !model.downloadable}
                  >
                    {model.downloading ? "下载中" : model.downloadable ? "下载" : "不可下载"}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </SettingsSection>
  );
}

type TokenPromptState = {
  model: ModelStatus;
  token: string;
  error: string | null;
  busy: boolean;
  hasStoredToken: boolean;
};

function looksLikeCredentialError(message: string | null | undefined) {
  if (!message) {
    return false;
  }

  const lowered = message.toLowerCase();
  return [
    "token",
    "credential",
    "auth",
    "unauthorized",
    "forbidden",
    "permission",
    "401",
    "403",
  ].some((keyword) => lowered.includes(keyword));
}

function getEngineDisplayName(engineName: string) {
  return engineDescriptions[engineName]?.split("，")[0] ?? engineName;
}

function getSelectionInvalidReason(
  fieldLabel: string,
  engineName: string,
  selectedValue: string,
  options: string[],
  displayModels: ModelStatus[],
): string | null {
  if (options.length === 0 && displayModels.length === 0) {
    return null;
  }

  if (!selectedValue) {
    return `${fieldLabel} 未选择模型`;
  }

  if (!options.includes(selectedValue)) {
    return `${fieldLabel} 无效：${selectedValue} 不属于 ${getEngineDisplayName(engineName)} 的可用模型`;
  }

  const selectedModel = displayModels.find((item) => item.model === selectedValue);
  if (!selectedModel) {
    return `${fieldLabel} 无效：${selectedValue} 不在当前模型目录中`;
  }

  if (selectedModel.error && !selectedModel.downloading) {
    return `${fieldLabel} 无效：${selectedModel.display_name}，${selectedModel.error}`;
  }

  if (!selectedModel.available && selectedModel.downloadable) {
    return `${fieldLabel} 无效：${selectedModel.display_name} 未下载或已被删除`;
  }

  if (!selectedModel.available && !selectedModel.downloadable) {
    return `${fieldLabel} 无效：${selectedModel.display_name} 在当前运行环境不可用`;
  }

  return null;
}

export function EngineSettings() {
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const availableEngines = useAppStore((state) => state.availableEngines);
  const setToast = useAppStore((state) => state.setToast);
  const backendConnected = useAppStore((state) => state.backendConnected);
  const models = useModelStore((state) => state.models);
  const refreshModels = useModelStore((state) => state.refresh);
  const startDownload = useModelStore((state) => state.startDownload);
  const deleteModel = useModelStore((state) => state.deleteModel);
  const [tokenPrompt, setTokenPrompt] = useState<TokenPromptState | null>(null);

  useEffect(() => {
    if (!backendConnected) {
      return;
    }

    void refreshModels().catch((error) => {
      setToast(error instanceof Error ? error.message : "加载模型列表失败");
    });
  }, [backendConnected, refreshModels, setToast]);

  const selectedEngineInfo = availableEngines.find((engine) => engine.name === settings.selectedEngine);
  const currentSelection = settings.engineSelections[settings.selectedEngine] ?? defaultSelectionForEngine(settings.selectedEngine);

  const scopedModels = useMemo(() => {
    const engineName = settings.selectedEngine;
    return models.filter((model) => {
      if (model.category === "asr") {
        return model.engine === engineName;
      }
      return model.engine_scope.includes(engineName);
    });
  }, [models, settings.selectedEngine]);

  const asrModels = (selectedEngineInfo?.asr_models ?? []).map((model) => {
    return scopedModels.find((item) => item.category === "asr" && item.model === model)
      ?? getDefaultModelStatus("asr", settings.selectedEngine, model);
  });
  const diarizationModels = (selectedEngineInfo?.diarization_models ?? []).map((model) => {
    return scopedModels.find((item) => item.category === "diarization" && item.model === model)
      ?? getDefaultModelStatus("diarization", settings.selectedEngine, model);
  });
  const mappingModels = (selectedEngineInfo?.speaker_mapping_models ?? []).map((model) => {
    return scopedModels.find((item) => item.category === "speaker_mapping" && item.model === model)
      ?? getDefaultModelStatus("speaker_mapping", settings.selectedEngine, model);
  });

  const updateEngineSelection = (partial: Partial<EngineSelection>) => {
    const nextSelection = {
      ...currentSelection,
      ...partial,
    };
    updateSettings({
      engineSelections: {
        ...settings.engineSelections,
        [settings.selectedEngine]: nextSelection,
      },
    });
  };

  const asrInvalidReason = getSelectionInvalidReason(
    "ASR",
    settings.selectedEngine,
    currentSelection.asrModel,
    selectedEngineInfo?.asr_models ?? [],
    asrModels,
  );
  const diarizationInvalidReason = getSelectionInvalidReason(
    "分离",
    settings.selectedEngine,
    currentSelection.diarizationModel,
    selectedEngineInfo?.diarization_models ?? [],
    diarizationModels,
  );
  const mappingInvalidReason = getSelectionInvalidReason(
    "映射",
    settings.selectedEngine,
    currentSelection.speakerMappingModel,
    selectedEngineInfo?.speaker_mapping_models ?? [],
    mappingModels,
  );
  const comboInvalidReasons = [asrInvalidReason, diarizationInvalidReason, mappingInvalidReason].filter(Boolean) as string[];

  const restoreDefaultSelection = () => {
    const defaultSelection = selectedEngineInfo?.default_selection ?? defaultSelectionForEngine(settings.selectedEngine);
    updateSettings({
      engineSelections: {
        ...settings.engineSelections,
        [settings.selectedEngine]: { ...defaultSelection },
      },
    });
    setToast(`${getEngineDisplayName(settings.selectedEngine)} 已恢复默认组合`);
  };

  const openTokenPrompt = (model: ModelStatus, token: string, error: string | null, hasStoredToken: boolean) => {
    setTokenPrompt({
      model,
      token,
      error,
      busy: false,
      hasStoredToken,
    });
  };

  const closeTokenPrompt = () => {
    setTokenPrompt(null);
  };

  const beginDownload = async (model: ModelStatus, token?: string) => {
    await startDownload(model.category, model.engine, model.model, token);
    setToast(`${model.display_name} 下载已开始`);
  };

  const handleDownload = async (model: ModelStatus) => {
    try {
      if (!model.requires_token) {
        await beginDownload(model);
        return;
      }

      const savedToken = await getModelDownloadToken(model.category, model.engine, model.model);
      const needsPrompt = !savedToken || looksLikeCredentialError(model.error);
      if (needsPrompt) {
        openTokenPrompt(
          model,
          savedToken ?? "",
          looksLikeCredentialError(model.error) ? model.error : null,
          Boolean(savedToken),
        );
        return;
      }

      await beginDownload(model, savedToken);
    } catch (error) {
      const message = error instanceof Error ? error.message : "模型下载启动失败";
      if (model.requires_token && looksLikeCredentialError(message)) {
        openTokenPrompt(model, "", message, false);
      } else {
        setToast(message);
      }
    }
  };

  const submitTokenPrompt = async () => {
    if (!tokenPrompt) {
      return;
    }

    const token = tokenPrompt.token.trim();
    if (!token) {
      setTokenPrompt((current) => (current ? { ...current, error: "Token 不能为空" } : current));
      return;
    }

    setTokenPrompt((current) => (current ? { ...current, busy: true, error: null } : current));
    try {
      await saveModelDownloadToken(
        tokenPrompt.model.category,
        tokenPrompt.model.engine,
        tokenPrompt.model.model,
        token,
      );
      await beginDownload(tokenPrompt.model, token);
      closeTokenPrompt();
    } catch (error) {
      setTokenPrompt((current) =>
        current
          ? {
              ...current,
              busy: false,
              hasStoredToken: true,
              error: error instanceof Error ? error.message : "保存 token 或启动下载失败",
            }
          : current,
      );
    }
  };

  const clearStoredToken = async () => {
    if (!tokenPrompt) {
      return;
    }

    try {
      await deleteModelDownloadToken(
        tokenPrompt.model.category,
        tokenPrompt.model.engine,
        tokenPrompt.model.model,
      );
      setTokenPrompt((current) =>
        current
          ? {
              ...current,
              token: "",
              error: null,
              busy: false,
              hasStoredToken: false,
            }
          : current,
      );
      setToast(`已清除 ${tokenPrompt.model.display_name} 的已存 token`);
    } catch (error) {
      setTokenPrompt((current) =>
        current
          ? {
              ...current,
              error: error instanceof Error ? error.message : "清除 token 失败",
            }
          : current,
      );
    }
  };

  return (
    <>
      <SettingsPage
        title="引擎"
        description="按引擎联动管理 ASR、说话人分离和说话人映射模型。默认组合会自动带出，但你可以在兼容范围内改。"
      >
        <SettingsSection
          title="引擎与当前组合"
          description="先决定当前引擎，再按需预加载整套组合。"
          actions={
            <>
              <button type="button" onClick={() => void refreshModels()} className={secondaryButtonClassName}>
                刷新
              </button>
              <button type="button" onClick={restoreDefaultSelection} className={secondaryButtonClassName}>
                恢复默认组合
              </button>
              <button
                type="button"
                onClick={() =>
                  void loadEngineSelection(
                    settings.selectedEngine,
                    currentSelection.asrModel,
                    currentSelection.diarizationModel,
                    currentSelection.speakerMappingModel,
                  )
                    .then(() => setToast("当前组合加载成功"))
                    .catch((error) => setToast(error instanceof Error ? error.message : "组合加载失败"))
                }
                className={primaryButtonClassName}
              >
                预加载当前组合
              </button>
            </>
          }
        >
          <div className="grid gap-3 md:grid-cols-2">
            <SettingsField label="选择引擎" hint={engineDescriptions[settings.selectedEngine] ?? "当前引擎描述待补充。"}>
              <select
                value={settings.selectedEngine}
                onChange={(event) => {
                  const next = event.target.value;
                  const match = availableEngines.find((engine) => engine.name === next);
                  updateSettings({
                    selectedEngine: next,
                    engineSelections: {
                      ...settings.engineSelections,
                      [next]: settings.engineSelections[next]
                        ?? match?.default_selection
                        ?? defaultSelectionForEngine(next),
                    },
                  });
                }}
                className={selectClassName}
              >
                {availableEngines.map((engine) => (
                  <option key={engine.name} value={engine.name}>
                    {engine.display_name ?? engine.name}
                  </option>
                ))}
              </select>
            </SettingsField>

            <SettingsField label="当前保存组合">
              <div
                className={`rounded-[12px] px-3 py-3 text-sm ${
                  comboInvalidReasons.length > 0
                    ? "border border-[#c53030] bg-[#fff5f5] text-[#9b2c2c]"
                    : "border border-line bg-panel text-ink/70"
                }`}
              >
                {currentSelection.asrModel} / {currentSelection.diarizationModel} / {currentSelection.speakerMappingModel}
                {comboInvalidReasons.length > 0 ? (
                  <div className="mt-2 space-y-1 text-xs">
                    {comboInvalidReasons.map((reason) => (
                      <div key={reason}>{reason}</div>
                    ))}
                  </div>
                ) : null}
              </div>
            </SettingsField>
          </div>
        </SettingsSection>

        <ModelSection
          title="ASR 模型"
          description="当前引擎下的可用 ASR 模型。"
          category="asr"
          selectedValue={currentSelection.asrModel}
          selectedLabel={currentSelection.asrModel}
          invalidReason={asrInvalidReason}
          options={selectedEngineInfo?.asr_models ?? []}
          displayModels={asrModels}
          onSelect={(value) => updateEngineSelection({ asrModel: value })}
          onDownload={(model) => void handleDownload(model)}
          onDelete={(model) => void deleteModel(model.category, model.engine, model.model)}
        />

        <ModelSection
          title="说话人分离模型"
          description="只显示当前引擎兼容的分离模型。"
          category="diarization"
          selectedValue={currentSelection.diarizationModel}
          selectedLabel={currentSelection.diarizationModel}
          invalidReason={diarizationInvalidReason}
          options={selectedEngineInfo?.diarization_models ?? []}
          displayModels={diarizationModels}
          onSelect={(value) => updateEngineSelection({ diarizationModel: value })}
          onDownload={(model) => void handleDownload(model)}
          onDelete={(model) => void deleteModel(model.category, model.engine, model.model)}
        />

        <ModelSection
          title="说话人映射模型"
          description="只显示当前引擎兼容的映射 / 识别模型。"
          category="speaker_mapping"
          selectedValue={currentSelection.speakerMappingModel}
          selectedLabel={currentSelection.speakerMappingModel}
          invalidReason={mappingInvalidReason}
          options={selectedEngineInfo?.speaker_mapping_models ?? []}
          displayModels={mappingModels}
          onSelect={(value) => updateEngineSelection({ speakerMappingModel: value })}
          onDownload={(model) => void handleDownload(model)}
          onDelete={(model) => void deleteModel(model.category, model.engine, model.model)}
        />
      </SettingsPage>

      <TokenPromptDialog
        open={tokenPrompt !== null}
        modelName={tokenPrompt?.model.display_name ?? ""}
        token={tokenPrompt?.token ?? ""}
        error={tokenPrompt?.error ?? null}
        busy={tokenPrompt?.busy ?? false}
        hasStoredToken={tokenPrompt?.hasStoredToken ?? false}
        onTokenChange={(value) =>
          setTokenPrompt((current) => (current ? { ...current, token: value, error: null } : current))
        }
        onSubmit={() => void submitTokenPrompt()}
        onCancel={closeTokenPrompt}
        onClearStoredToken={() => void clearStoredToken()}
      />
    </>
  );
}
