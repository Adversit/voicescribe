import { ConnectionStatus } from "../components/ConnectionStatus";
import { useAppStore } from "../stores/appStore";

export function GeneralSettings() {
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.22em] text-ink/45">General</p>
        <h1 className="text-3xl font-semibold">通用设置</h1>
        <p className="max-w-3xl text-sm leading-6 text-ink/65">
          这里统一管理后端状态、语言、输出方式和 AI 优化开关。运行时模型目录由桌面壳层注入，不依赖安装目录写权限。
        </p>
      </header>

      <ConnectionStatus />

      <section className="grid gap-5 md:grid-cols-2">
        <label className="rounded-[26px] border border-line bg-panel/85 p-5">
          <div className="text-sm font-semibold">语言</div>
          <select
            value={settings.language}
            onChange={(event) => updateSettings({ language: event.target.value })}
            className="mt-3 w-full rounded-2xl border border-line bg-white px-4 py-3 outline-none"
          >
            <option value="zh">中文</option>
            <option value="en">English</option>
            <option value="ja">日本語</option>
            <option value="ko">한국어</option>
            <option value="auto">自动检测</option>
          </select>
        </label>

        <label className="rounded-[26px] border border-line bg-panel/85 p-5">
          <div className="text-sm font-semibold">输出方式</div>
          <select
            value={settings.outputMode}
            onChange={(event) =>
              updateSettings({
                outputMode: event.target.value as "directInput" | "clipboard" | "both",
              })
            }
            className="mt-3 w-full rounded-2xl border border-line bg-white px-4 py-3 outline-none"
          >
            <option value="directInput">直接输入</option>
            <option value="clipboard">剪贴板</option>
            <option value="both">两者都执行</option>
          </select>
        </label>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <label className="flex items-center justify-between rounded-[26px] border border-line bg-panel/85 p-5">
          <div>
            <div className="text-sm font-semibold">说话人识别</div>
            <p className="mt-1 text-sm text-ink/60">沿用现有后端 diarization 与注册逻辑。</p>
          </div>
          <input
            type="checkbox"
            checked={settings.enableDiarization}
            onChange={(event) =>
              updateSettings({ enableDiarization: event.target.checked })
            }
            className="h-5 w-5 accent-accent"
          />
        </label>

        <label className="flex items-center justify-between rounded-[26px] border border-line bg-panel/85 p-5">
          <div>
            <div className="text-sm font-semibold">AI 文本优化</div>
            <p className="mt-1 text-sm text-ink/60">仅在热词命中与英文检测时触发后处理。</p>
          </div>
          <input
            type="checkbox"
            checked={settings.enableAIRefine}
            onChange={(event) => updateSettings({ enableAIRefine: event.target.checked })}
            className="h-5 w-5 accent-accent"
          />
        </label>
      </section>
    </div>
  );
}
