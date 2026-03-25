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
        <h1 className="text-3xl font-semibold">说话人管理</h1>
        <p className="max-w-3xl text-sm leading-6 text-ink/65">
          Windows 录音壳层尚在接入中；当前先支持上传 WAV 样本完成说话人注册，继续复用现有后端识别与存储逻辑。
        </p>
      </header>

      <section className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
        <div className="rounded-[28px] border border-line bg-panel/90 p-5">
          <div className="text-lg font-semibold">已注册说话人</div>
          <div className="mt-5 space-y-3">
            {speakers.length === 0 ? (
              <div className="rounded-2xl bg-canvas px-4 py-4 text-sm text-ink/55">
                暂无说话人样本。
              </div>
            ) : (
              speakers.map((speaker) => (
                <div
                  key={speaker.speaker_id}
                  className="flex items-center justify-between rounded-2xl border border-line bg-white/70 px-4 py-4"
                >
                  <div>
                    <div className="font-medium">{speaker.name}</div>
                    <div className="text-xs text-ink/45">{speaker.speaker_id}</div>
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
        </div>

        <form
          onSubmit={(event) => void onSubmit(event)}
          className="rounded-[28px] border border-line bg-panel/90 p-5"
        >
          <div className="text-lg font-semibold">上传声纹样本</div>
          <div className="mt-5 space-y-4">
            <label className="block">
              <div className="text-sm font-medium">姓名</div>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3"
                placeholder="例如：张三"
              />
            </label>
            <label className="block">
              <div className="text-sm font-medium">WAV 样本</div>
              <input
                type="file"
                accept=".wav,audio/wav"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className="mt-2 block w-full text-sm text-ink/65"
              />
            </label>
            <p className="text-sm leading-6 text-ink/55">
              建议上传 5-10 秒单人独白 WAV。后续接入原生录音后，这里会替换为内置采样流程。
            </p>
            <button
              type="submit"
              className="rounded-full bg-accent px-4 py-2 text-white"
              disabled={!name.trim() || !file}
            >
              注册说话人
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
