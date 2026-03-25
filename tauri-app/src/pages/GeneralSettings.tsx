import { ConnectionStatus } from "../components/ConnectionStatus";
import { useAppStore } from "../stores/appStore";

export function GeneralSettings() {
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const backendConnected = useAppStore((state) => state.backendConnected);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.22em] text-ink/45">General</p>
        <h1 className="text-3xl font-semibold">通用设置</h1>
        <p className="max-w-3xl text-sm leading-6 text-ink/65">
          对齐原版设置页的组织方式：语言、输出方式、识别选项和应用状态都放在同一处查看与调整。
        </p>
      </header>

      <ConnectionStatus />

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-[28px] border border-line bg-panel/90 p-5">
          <div className="text-lg font-semibold">语言</div>
          <label className="mt-4 block text-sm text-ink/65">
            默认语言
            <select
              value={settings.language}
              onChange={(event) => updateSettings({ language: event.target.value })}
              className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 outline-none"
            >
              <option value="zh">中文</option>
              <option value="en">英文</option>
              <option value="ja">日文</option>
              <option value="ko">韩文</option>
              <option value="auto">自动检测</option>
            </select>
          </label>
        </div>

        <div className="rounded-[28px] border border-line bg-panel/90 p-5">
          <div className="text-lg font-semibold">输出方式</div>
          <label className="mt-4 block text-sm text-ink/65">
            转录完成后
            <select
              value={settings.outputMode}
              onChange={(event) =>
                updateSettings({
                  outputMode: event.target.value as "directInput" | "clipboard" | "both",
                })
              }
              className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 outline-none"
            >
              <option value="directInput">直接输入到外部应用</option>
              <option value="clipboard">复制到剪贴板</option>
              <option value="both">两者都执行</option>
            </select>
          </label>
          <p className="mt-3 text-sm leading-6 text-ink/55">
            Windows 版不依赖 macOS 的辅助功能授权；当前实现通过剪贴板和键盘注入完成文本输出。
          </p>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <label className="flex items-start justify-between rounded-[28px] border border-line bg-panel/90 p-5">
          <div>
            <div className="text-lg font-semibold">说话人识别</div>
            <p className="mt-2 text-sm leading-6 text-ink/55">
              注册声纹后，转录结果会尽量带上说话人标签。
            </p>
          </div>
          <input
            type="checkbox"
            checked={settings.enableDiarization}
            onChange={(event) => updateSettings({ enableDiarization: event.target.checked })}
            className="mt-1 h-5 w-5 accent-accent"
          />
        </label>

        <label className="flex items-start justify-between rounded-[28px] border border-line bg-panel/90 p-5">
          <div>
            <div className="text-lg font-semibold">AI 文本优化</div>
            <p className="mt-2 text-sm leading-6 text-ink/55">
              对结果做轻量后处理，用于去语气词、修正部分错别字和整理英文片段。
            </p>
          </div>
          <input
            type="checkbox"
            checked={settings.enableAIRefine}
            onChange={(event) => updateSettings({ enableAIRefine: event.target.checked })}
            className="mt-1 h-5 w-5 accent-accent"
          />
        </label>
      </section>

      <section className="rounded-[28px] border border-line bg-panel/90 p-5">
        <div className="text-lg font-semibold">关于</div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl bg-white/80 px-4 py-4">
            <div className="text-xs uppercase tracking-[0.16em] text-ink/45">Version</div>
            <div className="mt-2 text-sm text-ink/75">0.2.0</div>
          </div>
          <div className="rounded-2xl bg-white/80 px-4 py-4">
            <div className="text-xs uppercase tracking-[0.16em] text-ink/45">Backend</div>
            <div className="mt-2 text-sm text-ink/75">{backendConnected ? "已连接" : "未连接"}</div>
          </div>
        </div>
      </section>
    </div>
  );
}
