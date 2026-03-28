import { FormEvent, useEffect, useState } from "react";
import { registerSpeakerSample } from "../api/backend";
import {
  SettingsField,
  SettingsPage,
  SettingsSection,
  dangerButtonClassName,
  inputClassName,
  primaryButtonClassName,
} from "../components/settings-ui";
import { useAppStore } from "../stores/appStore";

export function SpeakerSettings() {
  const speakers = useAppStore((state) => state.speakers);
  const refreshSpeakers = useAppStore((state) => state.refreshSpeakers);
  const removeSpeaker = useAppStore((state) => state.removeSpeaker);
  const addSpeaker = useAppStore((state) => state.addSpeaker);
  const setToast = useAppStore((state) => state.setToast);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    void refreshSpeakers();
  }, [refreshSpeakers]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !file) {
      return;
    }

    try {
      const speaker = await registerSpeakerSample(name.trim(), file);
      addSpeaker(speaker);
      setToast(`说话人 ${speaker.name} 已注册`);
      setName("");
      setFile(null);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "注册失败");
    }
  };

  return (
    <SettingsPage
      title="说话人"
      description="上半区保留局部滚动列表，下半区保持紧凑注册表单，避免整页被样本信息拉长。"
    >
      <SettingsSection
        title="已注册说话人"
        description="注册后，转录结果会尽量附带说话人标签。"
        actions={<span className="app-chip">{speakers.length} 个样本</span>}
      >
        <div className="list-scroll space-y-2">
          {speakers.length === 0 ? (
            <div className="rounded-[12px] border border-dashed border-line bg-panel px-4 py-3 text-sm text-ink/55">
              暂无已注册说话人。
            </div>
          ) : (
            speakers.map((speaker) => (
              <div
                key={speaker.speaker_id}
                className="flex items-center justify-between gap-3 rounded-[12px] border border-line bg-panel px-3.5 py-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-ink">{speaker.name}</div>
                  <div className="mt-0.5 truncate text-xs text-ink/46">{speaker.speaker_id}</div>
                </div>
                <button
                  type="button"
                  onClick={() => void removeSpeaker(speaker.speaker_id)}
                  className={dangerButtonClassName}
                >
                  删除
                </button>
              </div>
            ))
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        title="新增说话人"
        description="建议准备 5-10 秒单人独白 WAV。后续接入原生录音后，这里会换成更接近 macOS 原版的录制声纹流程。"
      >
        <form onSubmit={(event) => void onSubmit(event)} className="grid gap-3 xl:grid-cols-[1fr_1fr_auto] xl:items-end">
          <SettingsField label="说话人姓名">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={inputClassName}
              placeholder="例如：张三"
            />
          </SettingsField>
          <SettingsField label="WAV 样本" hint={file ? file.name : "请选择 WAV 文件作为样本。"}>
            <input
              type="file"
              accept=".wav,audio/wav"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="block w-full text-sm text-ink/65"
            />
          </SettingsField>
          <button
            type="submit"
            className={primaryButtonClassName}
            disabled={!name.trim() || !file}
          >
            注册
          </button>
        </form>
      </SettingsSection>
    </SettingsPage>
  );
}