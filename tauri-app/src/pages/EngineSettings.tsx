import { useEffect, useMemo } from "react";
import { loadEngineSelection } from "../api/backend";
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
  return (
    new Intl.NumberFormat("zh-CN", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value) + "B"
  );
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
    options,
    displayModels,
    onSelect,
    onDownload,
    onDelete,
  } = props;

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
          className={selectClassName}
        >
          {options.map((model) => (
            <option key={model} value={model}>
              {displayModels.find((item) => item.model === model)?.display_name ?? model}
            </option>
          ))}
        </select>
      </SettingsField>

      <div className="mt-4 list-scroll space-y-2">
        {displayModels.map((model) => (
          <div key={`${category}-${model.engine}-${model.model}`} className="rounded-[12px] border border-line bg-panel px-3.5 py-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-ink">{model.display_name}</div>
                <div className="mt-1 text-xs text-ink/58">状态：{renderStatus(model)}</div>
                <div className="mt-0.5 text-xs text-ink/46">
                  大小：{formatBytes(model.size_bytes)} · 已下载：{formatBytes(model.downloaded_bytes)}
                </div>
                {model.requires_token ? <div className="mt-1 text-xs text-ink/46">下载需要 token</div> : null}
                {model.error ? <div className="mt-1 text-xs text-[#9c4221]">{model.error}</div> : null}
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

  return (
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

          <SettingsField label="当前默认组合">
            <div className="rounded-[12px] border border-line bg-panel px-3 py-3 text-sm text-ink/70">
              {currentSelection.asrModel} / {currentSelection.diarizationModel} / {currentSelection.speakerMappingModel}
            </div>
          </SettingsField>
        </div>
      </SettingsSection>

      <ModelSection
        title="ASR 模型"
        description="当前引擎下的可用 ASR 模型。"
        category="asr"
        selectedValue={currentSelection.asrModel}
        options={selectedEngineInfo?.asr_models ?? []}
        displayModels={asrModels}
        onSelect={(value) => updateEngineSelection({ asrModel: value })}
        onDownload={(model) => void startDownload(model.category, model.engine, model.model)}
        onDelete={(model) => void deleteModel(model.category, model.engine, model.model)}
      />

      <ModelSection
        title="说话人分离模型"
        description="只显示当前引擎兼容的分离模型。"
        category="diarization"
        selectedValue={currentSelection.diarizationModel}
        options={selectedEngineInfo?.diarization_models ?? []}
        displayModels={diarizationModels}
        onSelect={(value) => updateEngineSelection({ diarizationModel: value })}
        onDownload={(model) => void startDownload(model.category, model.engine, model.model)}
        onDelete={(model) => void deleteModel(model.category, model.engine, model.model)}
      />

      <ModelSection
        title="说话人映射模型"
        description="只显示当前引擎兼容的映射 / 识别模型。"
        category="speaker_mapping"
        selectedValue={currentSelection.speakerMappingModel}
        options={selectedEngineInfo?.speaker_mapping_models ?? []}
        displayModels={mappingModels}
        onSelect={(value) => updateEngineSelection({ speakerMappingModel: value })}
        onDownload={(model) => void startDownload(model.category, model.engine, model.model)}
        onDelete={(model) => void deleteModel(model.category, model.engine, model.model)}
      />
    </SettingsPage>
  );
}
