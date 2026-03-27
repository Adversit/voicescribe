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
    <div className="space-y-3.5">
      <header className="space-y-1">
        <h1 className="text-[22px] font-semibold text-ink">说话人</h1>
        <p className="max-w-3xl text-xs leading-5 text-ink/60">
          上方列表局部滚动，下方保持紧凑的注册表单，避免整页被样本列表拉长。
        </p>
      </header>

      <section className="rounded-[18px] border border-[#e4dbc9] bg-[#faf6ef] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[15px] font-semibold text-ink">已注册说话人</div>
            <div className="mt-1 text-xs text-ink/55">注册后，转录结果会尽量附带说话人标签。</div>
          </div>
          <div className="rounded-full border border-[#ddd2c0] bg-white px-3 py-1.5 text-sm text-ink/70">
            {speakers.length} 个样本
          </div>
        </div>

        <div className="mt-3 max-h-[260px] space-y-2 overflow-y-auto pr-1">
          {speakers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#ddd2c0] bg-white px-4 py-3 text-sm text-ink/55">
              暂无已注册说话人。
            </div>
          ) : (
            speakers.map((speaker) => (
              <div
                key={speaker.speaker_id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-[#e4dbc9] bg-white px-3.5 py-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-ink">{speaker.name}</div>
                  <div className="mt-0.5 truncate text-xs text-ink/45">{speaker.speaker_id}</div>
                </div>
                <button
                  type="button"
                  onClick={() => void removeSpeaker(speaker.speaker_id)}
                  className="rounded-full border border-[#ddd2c0] bg-white px-3.5 py-1.5 text-sm text-ink/75"
                >
                  删除
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-[18px] border border-[#e4dbc9] bg-[#faf6ef] px-4 py-3">
        <div className="text-[15px] font-semibold text-ink">新增说话人</div>
        <p className="mt-1 text-xs leading-5 text-ink/55">
          建议准备 5-10 秒单人独白 WAV。后续接入原生录音后，这里会换成更接近 macOS 原版的“录制声纹”流程。
        </p>

        <form onSubmit={(event) => void onSubmit(event)} className="mt-3 grid gap-3 xl:grid-cols-[1fr_1fr_auto] xl:items-end">
          <label className="block text-sm text-ink/70">
            说话人姓名
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1.5 w-full rounded-2xl border border-[#ddd2c0] bg-white px-4 py-2.5"
              placeholder="例如：张三"
            />
          </label>
          <label className="block text-sm text-ink/70">
            WAV 样本
            <input
              type="file"
              accept=".wav,audio/wav"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="mt-1.5 block w-full text-sm text-ink/65"
            />
          </label>
          <button
            type="submit"
            className="rounded-full bg-accent px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!name.trim() || !file}
          >
            注册
          </button>
        </form>
      </section>
    </div>
  );
}
