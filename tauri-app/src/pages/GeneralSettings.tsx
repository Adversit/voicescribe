import { ConnectionStatus } from "../components/ConnectionStatus";
import { useEffect, useState } from "react";
import * as backendApi from "../api/backend";
import {
  SettingsField,
  SettingsPage,
  SettingsRow,
  SettingsSection,
  ToggleSwitch,
  inputClassName,
  secondaryButtonClassName,
  selectClassName,
} from "../components/settings-ui";
import { useAppStore } from "../stores/appStore";
import type { ProviderReadiness, StyleProfile, TextProcessingProvider } from "../types";

const providerLabels: Record<TextProcessingProvider, string> = {
  claude_cli: "Claude Code CLI",
  codex_cli: "Codex CLI",
  codex_sdk: "Codex SDK",
  openai_compatible: "OpenAI-compatible",
};

const readinessLabels = {
  ready: "已就绪",
  unconfigured: "待配置",
  unavailable: "不可用",
};

export function GeneralSettings() {
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const setLaunchAtLogin = useAppStore((state) => state.setLaunchAtLogin);
  const backendConnected = useAppStore((state) => state.backendConnected);
  const setToast = useAppStore((state) => state.setToast);
  const [providerReadiness, setProviderReadiness] = useState<ProviderReadiness[]>([]);
  const [probingProviders, setProbingProviders] = useState(false);
  const activeStyle = settings.styleProfiles.find((profile) => profile.id === settings.activeStyleProfileId) ?? null;

  useEffect(() => {
    setProviderReadiness([]);
  }, [backendConnected, settings.textProcessingBaseUrl, settings.textProcessingModel]);

  const probeProviders = async () => {
    setProbingProviders(true);
    try {
      const providers = await backendApi.probeTextProviders(
        settings.textProcessingProvider === "openai_compatible" ? settings.textProcessingModel : "",
        settings.textProcessingBaseUrl,
      );
      setProviderReadiness(providers);
      setToast("文本处理运行时检测完成");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "文本处理运行时检测失败");
    } finally {
      setProbingProviders(false);
    }
  };

  const addStyleProfile = () => {
    const profile: StyleProfile = {
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`,
      name: `自定义风格 ${settings.styleProfiles.length + 1}`,
      base_profile: settings.textProcessingProfile === "raw" ? "light" : settings.textProcessingProfile,
      instructions: "保持自然、简洁，并保留我的表达方式。",
    };
    updateSettings({
      styleProfiles: [...settings.styleProfiles, profile],
      activeStyleProfileId: profile.id,
      textProcessingProfile: profile.base_profile,
    });
  };

  const updateActiveStyle = (partial: Partial<StyleProfile>) => {
    if (!activeStyle) {
      return;
    }
    const nextStyle = { ...activeStyle, ...partial };
    updateSettings({
      styleProfiles: settings.styleProfiles.map((profile) => (profile.id === activeStyle.id ? nextStyle : profile)),
      textProcessingProfile: nextStyle.base_profile,
    });
  };

  const deleteActiveStyle = () => {
    if (!activeStyle) {
      return;
    }
    updateSettings({
      styleProfiles: settings.styleProfiles.filter((profile) => profile.id !== activeStyle.id),
      activeStyleProfileId: null,
    });
  };

  return (
    <SettingsPage
      title="通用"
      description="尽量对齐原生 app 的 Form + Section 组织方式，优先保证默认窗口下主要信息可以直接读完。"
    >
      <SettingsSection title="语言" description="保留原生设置页的单字段分组。">
        <SettingsField label="默认语言">
          <select
            value={settings.language}
            onChange={(event) => updateSettings({ language: event.target.value })}
            className={selectClassName}
          >
            <option value="zh">中文</option>
            <option value="en">英文</option>
            <option value="ja">日文</option>
            <option value="ko">韩文</option>
            <option value="auto">自动检测</option>
          </select>
        </SettingsField>
      </SettingsSection>

      <SettingsSection title="输出方式" description="转录完成后的默认输出目标。">
        <SettingsField label="转录完成后">
          <select
            value={settings.outputMode}
            onChange={(event) =>
              updateSettings({
                outputMode: event.target.value as "directInput" | "clipboard" | "both",
              })
            }
            className={selectClassName}
          >
            <option value="directInput">直接输入到外部应用</option>
            <option value="clipboard">复制到剪贴板</option>
            <option value="both">两者都执行</option>
          </select>
        </SettingsField>
      </SettingsSection>

      <SettingsSection
        title="智能文本处理"
        description="转写后通过本地 Claude Code、Codex、Codex SDK 或本地 OpenAI-compatible 服务生成最终文本；失败时自动保留原始转写。"
        actions={
          <button
            type="button"
            disabled={!backendConnected || probingProviders}
            onClick={() => void probeProviders()}
            className={`${secondaryButtonClassName} whitespace-nowrap`}
          >
            {probingProviders ? "检测中..." : "检测运行时"}
          </button>
        }
      >
        <div className="grid gap-3 md:grid-cols-2">
          <SettingsField label="输出 Profile">
            <select
              value={settings.textProcessingProfile}
              onChange={(event) => {
                const nextProfile = event.target.value as typeof settings.textProcessingProfile;
                updateSettings({
                  textProcessingProfile: nextProfile,
                  ...(activeStyle && nextProfile !== "raw"
                    ? {
                        styleProfiles: settings.styleProfiles.map((profile) =>
                          profile.id === activeStyle.id ? { ...profile, base_profile: nextProfile } : profile,
                        ),
                      }
                    : {}),
                });
              }}
              className={selectClassName}
            >
              <option value="raw">原始转写</option>
              <option value="light">轻度润色</option>
              <option value="structured">结构化提示词</option>
              <option value="formal">正式文本</option>
              <option value="translate">清理并翻译</option>
            </select>
          </SettingsField>
          <SettingsField label="本地 Style" hint="自定义规则仅保存在本机设置；history 只记录名称。">
            <select
              value={settings.activeStyleProfileId ?? ""}
              disabled={settings.textProcessingProfile === "raw"}
              onChange={(event) => {
                const selected = settings.styleProfiles.find((profile) => profile.id === event.target.value) ?? null;
                updateSettings({
                  activeStyleProfileId: selected?.id ?? null,
                  ...(selected ? { textProcessingProfile: selected.base_profile } : {}),
                });
              }}
              className={selectClassName}
            >
              <option value="">不使用自定义 Style</option>
              {settings.styleProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>{profile.name}</option>
              ))}
            </select>
          </SettingsField>
          <SettingsField label="处理 Provider">
            <select
              value={settings.textProcessingProvider}
              disabled={settings.textProcessingProfile === "raw"}
              onChange={(event) =>
                updateSettings({
                  textProcessingProvider: event.target.value as typeof settings.textProcessingProvider,
                })
              }
              className={selectClassName}
            >
              <option value="claude_cli">Claude Code CLI</option>
              <option value="codex_cli">Codex CLI</option>
              <option value="codex_sdk">Codex SDK</option>
              <option value="openai_compatible">本地 OpenAI-compatible / Ollama</option>
            </select>
          </SettingsField>
          <SettingsField label="模型" hint="CLI 留空时使用其本地默认模型；OpenAI-compatible 必须填写。">
            <input
              value={settings.textProcessingModel}
              disabled={settings.textProcessingProfile === "raw"}
              onChange={(event) => updateSettings({ textProcessingModel: event.target.value })}
              placeholder={
                settings.textProcessingProvider === "openai_compatible"
                  ? "例如 qwen3:8b"
                  : "留空使用 Provider 默认模型"
              }
              className={inputClassName}
            />
          </SettingsField>
          {settings.textProcessingProvider === "openai_compatible" ? (
            <SettingsField label="本地 endpoint" hint="默认兼容 Ollama 的 OpenAI API。">
              <input
                value={settings.textProcessingBaseUrl}
                disabled={settings.textProcessingProfile === "raw"}
                onChange={(event) => updateSettings({ textProcessingBaseUrl: event.target.value })}
                placeholder="http://127.0.0.1:11434/v1"
                className={inputClassName}
              />
            </SettingsField>
          ) : null}
          {settings.textProcessingProfile === "translate" ? (
            <SettingsField label="目标语言" hint="使用语言名或短语言代码，例如 English、zh、ja。">
              <input
                value={settings.textProcessingTargetLanguage}
                onChange={(event) => updateSettings({ textProcessingTargetLanguage: event.target.value })}
                placeholder="en"
                className={inputClassName}
              />
            </SettingsField>
          ) : null}
        </div>
        <div className="rounded-xl border border-[#e4dbc9] bg-white/55 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-ink">本地 Style Profiles</p>
              <p className="mt-1 text-xs leading-5 text-ink/50">用于显式控制语气和格式，不会授予 Provider 工具权限。</p>
            </div>
            <div className="flex gap-2">
              {activeStyle ? (
                <button type="button" onClick={deleteActiveStyle} className={secondaryButtonClassName}>删除当前</button>
              ) : null}
              <button type="button" onClick={addStyleProfile} className={secondaryButtonClassName}>新建 Style</button>
            </div>
          </div>
          {activeStyle ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <SettingsField label="Style 名称">
                <input
                  value={activeStyle.name}
                  onChange={(event) => updateActiveStyle({ name: event.target.value })}
                  className={inputClassName}
                />
              </SettingsField>
              <SettingsField label="基础 Profile">
                <select
                  value={activeStyle.base_profile}
                  onChange={(event) => updateActiveStyle({ base_profile: event.target.value as StyleProfile["base_profile"] })}
                  className={selectClassName}
                >
                  <option value="light">轻度润色</option>
                  <option value="structured">结构化提示词</option>
                  <option value="formal">正式文本</option>
                  <option value="translate">清理并翻译</option>
                </select>
              </SettingsField>
              <div className="md:col-span-2">
                <SettingsField label="风格说明" hint="最多 2,000 字符；只能影响语气、格式、简洁度和措辞。">
                  <textarea
                    value={activeStyle.instructions}
                    maxLength={2000}
                    rows={4}
                    onChange={(event) => updateActiveStyle({ instructions: event.target.value })}
                    className={inputClassName}
                  />
                </SettingsField>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-xs leading-5 text-ink/50">尚未选择自定义 Style；当前继续使用内置 Profile。</p>
          )}
        </div>
        {providerReadiness.length > 0 ? (
          <div className="grid gap-2 md:grid-cols-2">
            {providerReadiness.map((item) => (
              <div
                key={item.provider}
                className="rounded-xl border border-[#e4dbc9] bg-white/65 px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-ink">{providerLabels[item.provider]}</span>
                  <span className="app-chip">
                    {readinessLabels[item.status]} · {item.latency_ms} ms
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-ink/55">{item.detail}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs leading-5 text-ink/50">
            连接后端后可检测本机 Provider 与当前 OpenAI-compatible 模型是否就绪；检测不会执行真实润色或下载模型。
          </p>
        )}
        <SettingsRow
          title="使用目标应用类别"
          description="仅使用录音开始时目标应用的类别提供风格提示，不读取选区、正文或完整窗口标题。"
          control={
            <ToggleSwitch
              checked={settings.useAppContext}
              onChange={(next) => updateSettings({ useAppContext: next })}
            />
          }
        />
      </SettingsSection>

      <SettingsSection title="流式与历史记录" description="集中管理流式转录、AI 摘要和音频保留策略。">
        <SettingsRow
          title="启用流式传输"
          description="开启后，实时转录页会接收 /stream 的片段结果，历史记录会自动记录流式与非流式结果。"
          control={
            <ToggleSwitch
              checked={settings.enableStreaming}
              onChange={(next) => updateSettings({ enableStreaming: next, enableAISummary: next ? settings.enableAISummary : false })}
            />
          }
        />
        <SettingsRow
          title="AI 摘要总结"
          description="仅对流式结果生效，大约每 2 分钟生成一次摘要，并同步显示到实时转录页和历史记录详情。"
          control={
            <ToggleSwitch
              checked={settings.enableAISummary}
              onChange={(next) => updateSettings({ enableAISummary: next })}
            />
          }
        />
        <SettingsRow
          title="保留音频"
          description="关闭时仅保留转录文本和元数据，历史记录中的下载音频按钮不可用。"
          control={
            <ToggleSwitch
              checked={settings.retainAudio}
              onChange={(next) => updateSettings({ retainAudio: next })}
            />
          }
        />
      </SettingsSection>

      <SettingsSection title="其他" description="保留原生设置页的行式开关布局。">
        <SettingsRow
          title="说话人链路"
          description="开启后，转录会按当前引擎所选的分离模型和映射模型执行；关闭时保留选择但只跑 ASR。"
          control={
            <ToggleSwitch
              checked={settings.enableDiarization}
              onChange={(next) => updateSettings({ enableDiarization: next })}
            />
          }
        />
        <SettingsRow
          title="开机自启动"
          description="登录 Windows 后自动启动 VoiceScribe。"
          control={
            <ToggleSwitch
              checked={settings.launchAtLogin}
              onChange={(next) => {
                void setLaunchAtLogin(next).catch((error) => {
                  setToast(error instanceof Error ? error.message : "更新开机自启动失败");
                });
              }}
            />
          }
        />
      </SettingsSection>

      <SettingsSection title="关于" description="轻量展示版本和后端连接状态。">
        <SettingsRow title="应用版本" control={<span className="app-chip">0.2.0</span>} />
        <SettingsRow
          title="后端连接状态"
          description="当前桌面前端与 Python 后端的连接情况。"
          control={<span className="app-chip">{backendConnected ? "已连接" : "未连接"}</span>}
        />
        <div className="inline-status-row">
          <ConnectionStatus />
        </div>
      </SettingsSection>
    </SettingsPage>
  );
}

