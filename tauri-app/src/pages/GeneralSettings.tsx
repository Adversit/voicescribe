import { ConnectionStatus } from "../components/ConnectionStatus";
import { useAppStore } from "../stores/appStore";

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[22px] border border-[#e4dbc9] bg-[#faf6ef] p-4">
      <div className="text-base font-semibold text-ink">{title}</div>
      {description ? <p className="mt-1 text-sm leading-6 text-ink/55">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function GeneralSettings() {
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const setLaunchAtLogin = useAppStore((state) => state.setLaunchAtLogin);
  const syncAutostart = useAppStore((state) => state.syncAutostart);
  const backendConnected = useAppStore((state) => state.backendConnected);
  const setToast = useAppStore((state) => state.setToast);

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-[28px] font-semibold text-ink">通用</h1>
        <p className="max-w-3xl text-sm leading-6 text-ink/60">
          对齐原版设置页的分区方式：语言、输出方式、识别开关和应用状态都在这里调整。
        </p>
      </header>

      <ConnectionStatus />

      <SectionCard title="语言" description="默认转录语言。与原版一致，保留常用语言和自动检测。">
        <label className="block text-sm text-ink/70">
          默认语言
          <select
            value={settings.language}
            onChange={(event) => updateSettings({ language: event.target.value })}
            className="mt-2 w-full max-w-sm rounded-2xl border border-[#ddd2c0] bg-white px-4 py-3 outline-none"
          >
            <option value="zh">中文</option>
            <option value="en">英文</option>
            <option value="ja">日文</option>
            <option value="ko">韩文</option>
            <option value="auto">自动检测</option>
          </select>
        </label>
      </SectionCard>

      <SectionCard title="输出方式" description="转录完成后的默认输出策略。Windows 版通过剪贴板和键盘注入完成文本输出。">
        <label className="block text-sm text-ink/70">
          转录完成后
          <select
            value={settings.outputMode}
            onChange={(event) =>
              updateSettings({
                outputMode: event.target.value as "directInput" | "clipboard" | "both",
              })
            }
            className="mt-2 w-full max-w-sm rounded-2xl border border-[#ddd2c0] bg-white px-4 py-3 outline-none"
          >
            <option value="directInput">直接输入到外部应用</option>
            <option value="clipboard">复制到剪贴板</option>
            <option value="both">两者都执行</option>
          </select>
        </label>
      </SectionCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="识别选项">
          <div className="space-y-3">
            <label className="flex items-start justify-between gap-4 rounded-2xl border border-[#e4dbc9] bg-white px-4 py-4">
              <div>
                <div className="font-medium text-ink">说话人识别</div>
                <div className="mt-1 text-sm text-ink/55">注册声纹后，转录结果会尽量附带说话人标签。</div>
              </div>
              <input
                type="checkbox"
                checked={settings.enableDiarization}
                onChange={(event) => updateSettings({ enableDiarization: event.target.checked })}
                className="mt-1 h-5 w-5 accent-accent"
              />
            </label>
            <label className="flex items-start justify-between gap-4 rounded-2xl border border-[#e4dbc9] bg-white px-4 py-4">
              <div>
                <div className="font-medium text-ink">AI 文本优化</div>
                <div className="mt-1 text-sm text-ink/55">去语气词、修正部分错别字，并整理英文片段。</div>
              </div>
              <input
                type="checkbox"
                checked={settings.enableAIRefine}
                onChange={(event) => updateSettings({ enableAIRefine: event.target.checked })}
                className="mt-1 h-5 w-5 accent-accent"
              />
            </label>
          </div>
        </SectionCard>

        <SectionCard title="启动选项">
          <div className="rounded-2xl border border-[#e4dbc9] bg-white px-4 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-medium text-ink">开机自启动</div>
                <div className="mt-1 text-sm text-ink/55">登录 Windows 后自动启动 VoiceScribe。</div>
              </div>
              <input
                type="checkbox"
                checked={settings.launchAtLogin}
                onChange={(event) => {
                  void setLaunchAtLogin(event.target.checked).catch((error) => {
                    setToast(error instanceof Error ? error.message : "更新开机自启失败");
                  });
                }}
                className="mt-1 h-5 w-5 accent-accent"
              />
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="关于">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-[#e4dbc9] bg-white px-4 py-4">
            <div className="text-xs uppercase tracking-[0.16em] text-ink/45">Version</div>
            <div className="mt-2 text-sm text-ink/75">0.2.0</div>
          </div>
          <div className="rounded-2xl border border-[#e4dbc9] bg-white px-4 py-4">
            <div className="text-xs uppercase tracking-[0.16em] text-ink/45">Backend</div>
            <div className="mt-2 text-sm text-ink/75">{backendConnected ? "已连接" : "未连接"}</div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
