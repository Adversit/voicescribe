import { useEffect } from "react";
import { loadEngine } from "../api/backend";
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
  const models = useModelStore((state) => state.models);
  const refreshModels = useModelStore((state) => state.refresh);
  const startDownload = useModelStore((state) => state.startDownload);
  const deleteModel = useModelStore((state) => state.deleteModel);

  useEffect(() => {
    void refreshModels();
  }, [refreshModels]);

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
    <div className="space-y-3.5">
      <header className="space-y-1">
        <h1 className="text-[22px] font-semibold text-ink">引擎</h1>
        <p className="max-w-3xl text-xs leading-5 text-ink/60">
          上方切换引擎和模型，下方用局部列表管理可下载状态，避免整页被模型列表拉长。
        </p>
      </header>

      <section className="rounded-[18px] border border-[#e4dbc9] bg-[#faf6ef] px-4 py-3">
        <div className="grid gap-3 xl:grid-cols-[1fr_1fr_auto] xl:items-end">
          <label className="block text-sm text-ink/70">
            选择引擎
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
              className="mt-1.5 w-full rounded-2xl border border-[#ddd2c0] bg-white px-4 py-2.5"
            >
              {availableEngines.map((engine) => (
                <option key={engine.name} value={engine.name}>
                  {engine.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm text-ink/70">
            选择模型
            <select
              value={settings.selectedModel}
              onChange={(event) => updateSettings({ selectedModel: event.target.value })}
              className="mt-1.5 w-full rounded-2xl border border-[#ddd2c0] bg-white px-4 py-2.5"
            >
              {(selectedEngineInfo?.models ?? []).map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap gap-2 xl:justify-end">
            <button
              type="button"
              onClick={() =>
                void loadEngine(settings.selectedEngine, settings.selectedModel)
                  .then(() => setToast("模型加载成功"))
                  .catch((error) =>
                    setToast(error instanceof Error ? error.message : "模型加载失败"),
                  )
              }
              className="rounded-full bg-accent px-4 py-2 text-sm text-white"
            >
              预加载
            </button>
            <button
              type="button"
              onClick={() => void refreshModels()}
              className="rounded-full border border-[#ddd2c0] bg-white px-4 py-2 text-sm text-ink/75"
            >
              刷新
            </button>
          </div>
        </div>

        <p className="mt-3 text-xs leading-5 text-ink/60">
          {engineDescriptions[settings.selectedEngine] ?? "当前引擎描述待补充。"}
        </p>
      </section>

      <section className="rounded-[18px] border border-[#e4dbc9] bg-[#faf6ef] px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[15px] font-semibold text-ink">模型管理</div>
            <p className="mt-1 text-xs leading-5 text-ink/55">
              固定下载到并读取自 <code>models/</code>。长列表限制在局部滚动区域内。
            </p>
          </div>
          <div className="text-xs text-ink/45">{displayModels.length} 个模型</div>
        </div>

        <div className="mt-3 max-h-[360px] space-y-2 overflow-y-auto pr-1">
          {displayModels.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#ded4c4] bg-white px-4 py-3 text-sm text-ink/55">
              当前引擎没有可展示的模型列表。
            </div>
          ) : (
            displayModels.map((model) => (
              <div
                key={`${model.engine}-${model.model}`}
                className="flex flex-col gap-2 rounded-2xl border border-[#e4dbc9] bg-white px-3.5 py-3 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-ink">{model.model}</div>
                  <div className="mt-0.5 text-xs text-ink/55">
                    状态：{model.downloading ? "下载中" : model.available ? "已就绪" : "未下载"}
                  </div>
                  <div className="mt-0.5 text-xs text-ink/45">
                    大小：{formatBytes(model.size_bytes)} · 已下载：{formatBytes(model.downloaded_bytes)}
                  </div>
                  {model.error ? <div className="mt-1 text-xs text-[#a53f1c]">{model.error}</div> : null}
                </div>
                <div className="flex items-center gap-2">
                  {model.available ? (
                    <button
                      type="button"
                      onClick={() => void deleteModel(model.engine, model.model)}
                      className="rounded-full border border-[#ddd2c0] bg-white px-3.5 py-1.5 text-sm text-ink/75"
                    >
                      删除
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void startDownload(model.engine, model.model)}
                      className="rounded-full bg-accent px-3.5 py-1.5 text-sm text-white"
                      disabled={model.downloading}
                    >
                      {model.downloading ? "下载中" : "下载"}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
