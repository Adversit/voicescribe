import { ConnectionStatus } from "../components/ConnectionStatus";
import { useAppStore } from "../stores/appStore";

function CompactSection({
  title,
  description,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-[18px] border border-[#e4dbc9] bg-[#faf6ef] px-4 py-3 ${className}`.trim()}>
      <div className="text-[15px] font-semibold text-ink">{title}</div>
      {description ? <p className="mt-1 text-xs leading-5 text-ink/55">{description}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function GeneralSettings() {
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const setLaunchAtLogin = useAppStore((state) => state.setLaunchAtLogin);
  const backendConnected = useAppStore((state) => state.backendConnected);
  const setToast = useAppStore((state) => state.setToast);

  return (
    <div className="space-y-3.5">
      <header className="space-y-1">
        <h1 className="text-[22px] font-semibold text-ink">通用</h1>
        <p className="max-w-3xl text-xs leading-5 text-ink/60">
          语言、输出方式、识别开关和应用状态集中在这一页，优先保证默认窗口下单屏可读。
        </p>
      </header>

      <ConnectionStatus />

      <div className="grid gap-3 xl:grid-cols-[1.05fr_1.05fr_0.9fr]">
        <CompactSection title="语言" description="默认转录语言。保留常用语言和自动检测。">
          <label className="block text-sm text-ink/70">
            <span className="sr-only">默认语言</span>
            <select
              value={settings.language}
              onChange={(event) => updateSettings({ language: event.target.value })}
              className="w-full rounded-2xl border border-[#ddd2c0] bg-white px-4 py-2.5 outline-none"
            >
              <option value="zh">中文</option>
              <option value="en">英文</option>
              <option value="ja">日文</option>
              <option value="ko">韩文</option>
              <option value="auto">自动检测</option>
            </select>
          </label>
        </CompactSection>

        <CompactSection title="输出方式" description="完成后输出到外部应用、剪贴板或两者都执行。">
          <label className="block text-sm text-ink/70">
            <span className="sr-only">转录完成后</span>
            <select
              value={settings.outputMode}
              onChange={(event) =>
                updateSettings({
                  outputMode: event.target.value as "directInput" | "clipboard" | "both",
                })
              }
              className="w-full rounded-2xl border border-[#ddd2c0] bg-white px-4 py-2.5 outline-none"
            >
              <option value="directInput">直接输入到外部应用</option>
              <option value="clipboard">复制到剪贴板</option>
              <option value="both">两者都执行</option>
            </select>
          </label>
        </CompactSection>

        <CompactSection title="关于" description="版本和当前后端连接状态。">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-2xl border border-[#e4dbc9] bg-white px-3 py-2.5">
              <div className="text-[11px] uppercase tracking-[0.14em] text-ink/45">Version</div>
              <div className="mt-1 text-sm text-ink/75">0.2.0</div>
            </div>
            <div className="rounded-2xl border border-[#e4dbc9] bg-white px-3 py-2.5">
              <div className="text-[11px] uppercase tracking-[0.14em] text-ink/45">Backend</div>
              <div className="mt-1 text-sm text-ink/75">{backendConnected ? "已连接" : "未连接"}</div>
            </div>
          </div>
        </CompactSection>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.35fr_0.95fr]">
        <CompactSection title="识别选项" description="保留原版的识别增强开关，但压缩成更紧凑的两行设置。">
          <div className="space-y-2.5">
            <label className="flex items-start justify-between gap-3 rounded-2xl border border-[#e4dbc9] bg-white px-3 py-2.5">
              <div>
                <div className="text-sm font-medium text-ink">说话人识别</div>
                <div className="mt-0.5 text-xs leading-5 text-ink/55">注册声纹后，转录结果会尽量附带说话人标签。</div>
              </div>
              <input
                type="checkbox"
                checked={settings.enableDiarization}
                onChange={(event) => updateSettings({ enableDiarization: event.target.checked })}
                className="mt-1 h-4.5 w-4.5 accent-accent"
              />
            </label>
            <label className="flex items-start justify-between gap-3 rounded-2xl border border-[#e4dbc9] bg-white px-3 py-2.5">
              <div>
                <div className="text-sm font-medium text-ink">AI 文本优化</div>
                <div className="mt-0.5 text-xs leading-5 text-ink/55">去语气词、修正部分错别字，并整理英文片段。</div>
              </div>
              <input
                type="checkbox"
                checked={settings.enableAIRefine}
                onChange={(event) => updateSettings({ enableAIRefine: event.target.checked })}
                className="mt-1 h-4.5 w-4.5 accent-accent"
              />
            </label>
          </div>
        </CompactSection>

        <CompactSection title="启动选项" description="登录 Windows 后自动启动 VoiceScribe。">
          <label className="flex items-start justify-between gap-3 rounded-2xl border border-[#e4dbc9] bg-white px-3 py-2.5">
            <div>
              <div className="text-sm font-medium text-ink">开机自启动</div>
              <div className="mt-0.5 text-xs leading-5 text-ink/55">写入系统登录项，启动后可直接待命。</div>
            </div>
            <input
              type="checkbox"
              checked={settings.launchAtLogin}
              onChange={(event) => {
                void setLaunchAtLogin(event.target.checked).catch((error) => {
                  setToast(error instanceof Error ? error.message : "更新开机自启失败");
                });
              }}
              className="mt-1 h-4.5 w-4.5 accent-accent"
            />
          </label>
        </CompactSection>
      </div>
    </div>
  );
}
