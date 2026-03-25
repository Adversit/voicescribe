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
  const backendConnected = useAppStore((state) => state.backendConnected);
  const setToast = useAppStore((state) => state.setToast);
  const models = useModelStore((state) => state.models);
  const refreshModels = useModelStore((state) => state.refresh);
  const startDownload = useModelStore((state) => state.startDownload);
  const deleteModel = useModelStore((state) => state.deleteModel);

  useEffect(() => {
    void refreshModels();
  }, [refreshModels, backendConnected]);

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
    (model) =>
      modelStatusMap.get(model) ??
      getDefaultModelStatus(settings.selectedEngine, model),
  );
  const supportsDownloads = currentEngineModels.length > 0;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Engine</p>
        <h1 className="text-3xl font-semibold">引擎与模型</h1>
        <p className="max-w-3xl text-sm leading-6 text-ink/65">
          所有模型统一下载到并读取自项目根目录的 <code>models/</code>。可选模型与可下载模型都以同一份后端定义为准，未下载模型也会显示出来。
        </p>
      </header>

      <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[28px] border border-line bg-panel/90 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label>
              <div className="text-sm font-semibold">引擎</div>
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
                className="mt-3 w-full rounded-2xl border border-line bg-white px-4 py-3"
              >
                {availableEngines.map((engine) => (
                  <option key={engine.name} value={engine.name}>
                    {engine.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <div className="text-sm font-semibold">模型</div>
              <select
                value={settings.selectedModel}
                onChange={(event) => updateSettings({ selectedModel: event.target.value })}
                className="mt-3 w-full rounded-2xl border border-line bg-white px-4 py-3"
              >
                {(selectedEngineInfo?.models ?? []).map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="mt-4 text-sm leading-6 text-ink/65">
            {engineDescriptions[settings.selectedEngine] ?? "当前引擎描述待补充。"}
          </p>

          <div className="mt-5 flex gap-3">
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
              className="rounded-full border border-line px-4 py-2 text-sm text-ink/75"
            >
              刷新模型状态
            </button>
          </div>
        </div>

        <aside className="rounded-[28px] border border-line bg-panel/90 p-5">
          <div className="text-sm font-semibold">运行策略</div>
          <ul className="mt-3 space-y-3 text-sm leading-6 text-ink/65">
            <li>模型目录固定为项目根目录 <code>models/</code>。</li>
            <li>后端会从 <code>models/voicescribe_models.json</code> 读取已下载状态。</li>
            <li>旧注册表里的历史绝对路径会自动 rebasing 到当前 <code>models/</code>。</li>
            <li>所有引擎都按完整模型清单展示，未下载项会保留下载入口。</li>
          </ul>
        </aside>
      </section>

      <section className="rounded-[28px] border border-line bg-panel/90 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">可下载模型状态</div>
            <div className="mt-1 text-sm text-ink/55">
              当前引擎：{settings.selectedEngine}
            </div>
          </div>
        </div>
        <div className="mt-5 space-y-3">
          {supportsDownloads ? (
            displayModels.map((model) => (
              <div
                key={`${model.engine}-${model.model}`}
                className="grid gap-3 rounded-2xl border border-line bg-white/70 px-4 py-4 md:grid-cols-[1fr_auto]"
              >
                <div>
                  <div className="font-medium">{model.model}</div>
                  <div className="mt-1 text-sm text-ink/55">
                    状态：{model.downloading ? "下载中" : model.available ? "已就绪" : "未下载"}
                  </div>
                  <div className="mt-1 text-xs text-ink/45">
                    大小：{formatBytes(model.size_bytes)} · 已下载：
                    {formatBytes(model.downloaded_bytes)}
                  </div>
                  {model.error ? (
                    <div className="mt-2 text-sm text-[#a53f1c]">{model.error}</div>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {model.available ? (
                    <button
                      type="button"
                      onClick={() => void deleteModel(model.engine, model.model)}
                      className="rounded-full border border-line px-4 py-2 text-sm text-ink/75"
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
          ) : (
            <div className="rounded-2xl border border-dashed border-line bg-white/60 px-4 py-5 text-sm leading-6 text-ink/60">
              当前引擎没有可展示的模型列表。
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
