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
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-[28px] font-semibold text-ink">引擎</h1>
        <p className="max-w-3xl text-sm leading-6 text-ink/60">
          这里保持原版的两段式结构：上方选择引擎和模型，下方管理当前引擎的可用模型状态。
        </p>
      </header>

      <section className="rounded-[22px] border border-[#e4dbc9] bg-[#faf6ef] p-4">
        <div className="grid gap-4 md:grid-cols-2">
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
              className="mt-2 w-full rounded-2xl border border-[#ddd2c0] bg-white px-4 py-3"
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
              className="mt-2 w-full rounded-2xl border border-[#ddd2c0] bg-white px-4 py-3"
            >
              {(selectedEngineInfo?.models ?? []).map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="mt-4 text-sm leading-6 text-ink/60">
          {engineDescriptions[settings.selectedEngine] ?? "当前引擎描述待补充。"}
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
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
            预加载当前模型
          </button>
          <button
            type="button"
            onClick={() => void refreshModels()}
            className="rounded-full border border-[#ddd2c0] bg-white px-4 py-2 text-sm text-ink/75"
          >
            刷新模型状态
          </button>
        </div>
      </section>

      <section className="rounded-[22px] border border-[#e4dbc9] bg-[#faf6ef] p-4">
        <div className="text-base font-semibold text-ink">模型管理</div>
        <p className="mt-1 text-sm leading-6 text-ink/55">
          所有模型固定下载到并读取自项目根目录的 <code>models/</code>。未下载模型也会显示并保留下载入口。
        </p>

        <div className="mt-4 space-y-3">
          {displayModels.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#ded4c4] bg-white px-4 py-4 text-sm text-ink/55">
              当前引擎没有可展示的模型列表。
            </div>
          ) : (
            displayModels.map((model) => (
              <div
                key={`${model.engine}-${model.model}`}
                className="flex flex-col gap-3 rounded-2xl border border-[#e4dbc9] bg-white px-4 py-4 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <div className="font-medium text-ink">{model.model}</div>
                  <div className="mt-1 text-sm text-ink/55">
                    状态：{model.downloading ? "下载中" : model.available ? "已就绪" : "未下载"}
                  </div>
                  <div className="mt-1 text-xs text-ink/45">
                    大小：{formatBytes(model.size_bytes)} · 已下载：{formatBytes(model.downloaded_bytes)}
                  </div>
                  {model.error ? <div className="mt-2 text-sm text-[#a53f1c]">{model.error}</div> : null}
                </div>
                <div className="flex items-center gap-2">
                  {model.available ? (
                    <button
                      type="button"
                      onClick={() => void deleteModel(model.engine, model.model)}
                      className="rounded-full border border-[#ddd2c0] bg-white px-4 py-2 text-sm text-ink/75"
                    >
                      删除
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void startDownload(model.engine, model.model)}
                      className="rounded-full bg-accent px-4 py-2 text-sm text-white"
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
