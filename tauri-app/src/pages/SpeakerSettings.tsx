import { FormEvent, useEffect, useState } from "react";
import { registerSpeakerSample } from "../api/backend";
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
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Speaker</p>
        <h1 className="text-3xl font-semibold">说话人</h1>
        <p className="max-w-3xl text-sm leading-6 text-ink/65">
          保持原版的两段式结构：上方查看已注册说话人，下方新增样本。Windows 端当前先用 WAV 上传替代内置采样。
        </p>
      </header>

      <section className="rounded-[28px] border border-line bg-panel/90 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">已注册说话人</div>
            <div className="mt-1 text-sm text-ink/55">注册后，转录结果会尽量附带说话人标签。</div>
          </div>
          <div className="rounded-full bg-white/80 px-4 py-2 text-sm text-ink/70">
            {speakers.length} 个样本
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {speakers.length === 0 ? (
            <div className="rounded-2xl bg-white/70 px-4 py-4 text-sm text-ink/55">
              暂无已注册说话人。
            </div>
          ) : (
            speakers.map((speaker) => (
              <div
                key={speaker.speaker_id}
                className="flex items-center justify-between rounded-2xl border border-line bg-white/80 px-4 py-4"
              >
                <div>
                  <div className="font-medium text-ink">{speaker.name}</div>
                  <div className="mt-1 text-xs text-ink/45">{speaker.speaker_id}</div>
                </div>
                <button
                  type="button"
                  onClick={() => void removeSpeaker(speaker.speaker_id)}
                  className="rounded-full border border-line px-4 py-2 text-sm text-ink/75"
                >
                  删除
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-[28px] border border-line bg-panel/90 p-5">
        <div className="text-lg font-semibold">新增说话人</div>
        <p className="mt-2 text-sm leading-6 text-ink/55">
          建议准备 5-10 秒单人独白 WAV。后续接入原生录音后，这里会换成和 macOS 原版更接近的“录制声纹”流程。
        </p>

        <form onSubmit={(event) => void onSubmit(event)} className="mt-5 space-y-4">
          <label className="block text-sm font-medium text-ink/70">
            说话人姓名
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3"
              placeholder="例如：张三"
            />
          </label>
          <label className="block text-sm font-medium text-ink/70">
            WAV 样本
            <input
              type="file"
              accept=".wav,audio/wav"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="mt-2 block w-full text-sm text-ink/65"
            />
          </label>
          <button
            type="submit"
            className="rounded-full bg-accent px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!name.trim() || !file}
          >
            注册说话人
          </button>
        </form>
      </section>
    </div>
  );
}
