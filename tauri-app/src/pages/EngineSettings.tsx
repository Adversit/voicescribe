import { useEffect } from "react";
import { loadEngine } from "../api/backend";
import { useAppStore } from "../stores/appStore";
import { useModelStore } from "../stores/modelStore";

const engineDescriptions: Record<string, string> = {
  whisper: "OpenAI Whisper，多语言通用引擎。",
  whispercpp: "whisper.cpp CLI，适合独立轻量部署。",
  funasr: "阿里 FunASR，中文热词效果最佳。",
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

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Engine</p>
        <h1 className="text-3xl font-semibold">引擎与模型</h1>
        <p className="max-w-3xl text-sm leading-6 text-ink/65">
          应用本身不打包模型。这里仅负责查看后端可见的模型状态，并调用现有系统下载逻辑完成获取。
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
            <li>模型目录由运行时写入用户数据目录，不依赖安装目录。</li>
            <li>安装包只包含后端和桌面壳层，不携带模型权重。</li>
            <li>FunASR 下载仍走现有 `/models/download` 与注册表逻辑。</li>
          </ul>
        </aside>
      </section>

      <section className="rounded-[28px] border border-line bg-panel/90 p-5">
        <div className="text-lg font-semibold">FunASR 模型状态</div>
        <div className="mt-5 space-y-3">
          {models.map((model) => (
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
          ))}
        </div>
      </section>
    </div>
  );
}
