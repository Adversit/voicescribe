import { ConnectionStatus } from "../components/ConnectionStatus";
import {
  SettingsField,
  SettingsPage,
  SettingsRow,
  SettingsSection,
  ToggleSwitch,
  selectClassName,
} from "../components/settings-ui";
import { useAppStore } from "../stores/appStore";

export function GeneralSettings() {
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const setLaunchAtLogin = useAppStore((state) => state.setLaunchAtLogin);
  const backendConnected = useAppStore((state) => state.backendConnected);
  const setToast = useAppStore((state) => state.setToast);

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
          title="说话人识别"
          description="注册声纹后，转录结果会尽量附带说话人标签。"
          control={
            <ToggleSwitch
              checked={settings.enableDiarization}
              onChange={(next) => updateSettings({ enableDiarization: next })}
            />
          }
        />
        <SettingsRow
          title="AI 文本优化"
          description="去除语气词、修正部分错别字，并整理英文片段。"
          control={
            <ToggleSwitch
              checked={settings.enableAIRefine}
              onChange={(next) => updateSettings({ enableAIRefine: next })}
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

