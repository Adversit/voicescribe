import { useEffect } from "react";
import { loadEngine } from "../api/backend";
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
import type { ModelStatus } from "../types";

const engineDescriptions: Record<string, string> = {
  whisper: "OpenAI Whisper，多语言通用引擎。",
  whispercpp: "whisper.cpp CLI，适合独立轻量部署。",
  funasr: "阿里 FunASR，模型状态与下载统一从项目根目录 models/ 读取。",
  parakeet: "NVIDIA Parakeet，偏英文与 GPU 场景。",
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

function getDefaultModelStatus(engine: string, model: string): ModelStatus {
  return {
    engine,
    model,
    available: false,
    downloading: false,
    size_bytes: null,
    downloaded_bytes: null,
    error: null,
  };
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

  const selectedEngineInfo = availableEngines.find(
    (engine) => engine.name === settings.selectedEngine,
  );
  const modelStatusMap = new Map(
    models
      .filter((model) => model.engine === settings.selectedEngine)
      .map((model) => [model.model, model] as const),
  );
  const currentEngineModels = selectedEngineInfo?.models ?? [];
  const displayModels = currentEngineModels.map(
    (model) => modelStatusMap.get(model) ?? getDefaultModelStatus(settings.selectedEngine, model),
  );

  return (
    <SettingsPage
      title="引擎"
      description="保持原生设置页的上紧下松结构：上面选引擎和模型，下面用局部列表管理下载状态。"
    >
      <SettingsSection
        title="引擎与模型"
        description="先决定引擎和默认模型，再按需预加载。"
        actions={
          <>
            <button type="button" onClick={() => void refreshModels()} className={secondaryButtonClassName}>
              刷新
            </button>
            <button
              type="button"
              onClick={() =>
                void loadEngine(settings.selectedEngine, settings.selectedModel)
                  .then(() => setToast("模型加载成功"))
                  .catch((error) =>
                    setToast(error instanceof Error ? error.message : "模型加载失败"),
                  )
              }
              className={primaryButtonClassName}
            >
              预加载
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
                  selectedModel: match?.models[0] ?? settings.selectedModel,
                });
              }}
              className={selectClassName}
            >
              {availableEngines.map((engine) => (
                <option key={engine.name} value={engine.name}>
                  {engine.name}
                </option>
              ))}
            </select>
          </SettingsField>

          <SettingsField label="选择模型">
            <select
              value={settings.selectedModel}
              onChange={(event) => updateSettings({ selectedModel: event.target.value })}
              className={selectClassName}
            >
              {(selectedEngineInfo?.models ?? []).map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </SettingsField>
        </div>
      </SettingsSection>

      <SettingsSection
        title="模型管理"
        description="固定下载到并读取自 models/。列表只在本区滚动，不拉长整页。"
        actions={<span className="app-chip">{displayModels.length} 个模型</span>}
      >
        <div className="list-scroll space-y-2">
          {displayModels.length === 0 ? (
            <div className="rounded-[12px] border border-dashed border-line bg-panel px-4 py-3 text-sm text-ink/55">
              当前引擎没有可展示的模型列表。
            </div>
          ) : (
            displayModels.map((model) => (
              <div
                key={`${model.engine}-${model.model}`}
                className="rounded-[12px] border border-line bg-panel px-3.5 py-3"
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-ink">{model.model}</div>
                    <div className="mt-1 text-xs text-ink/58">
                      状态：{model.downloading ? "下载中" : model.available ? "已就绪" : "未下载"}
                    </div>
                    <div className="mt-0.5 text-xs text-ink/46">
                      大小：{formatBytes(model.size_bytes)} · 已下载：{formatBytes(model.downloaded_bytes)}
                    </div>
                    {model.error ? <div className="mt-1 text-xs text-[#9c4221]">{model.error}</div> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {model.available ? (
                      <button
                        type="button"
                        onClick={() => void deleteModel(model.engine, model.model)}
                        className={dangerButtonClassName}
                      >
                        删除
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void startDownload(model.engine, model.model)}
                        className={primaryButtonClassName}
                        disabled={model.downloading}
                      >
                        {model.downloading ? "下载中" : "下载"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </SettingsSection>
    </SettingsPage>
  );
}