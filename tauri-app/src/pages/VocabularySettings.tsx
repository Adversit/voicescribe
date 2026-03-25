import { FormEvent, useMemo, useState } from "react";
import { useAppStore } from "../stores/appStore";

export function VocabularySettings() {
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const [draft, setDraft] = useState("");

  const tags = useMemo(
    () =>
      settings.hotwords
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    [settings.hotwords],
  );

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const value = draft.trim();
    if (!value) {
      return;
    }
    const next = [...new Set([...tags, value])];
    updateSettings({ hotwords: next.join(",") });
    setDraft("");
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Vocabulary</p>
        <h1 className="text-3xl font-semibold">热词管理</h1>
        <p className="max-w-3xl text-sm leading-6 text-ink/65">
          当前实现沿用后端热词格式：逗号分隔字符串。桌面端只负责输入体验和持久化，不改变后端处理方式。
        </p>
      </header>

      <section className="rounded-[28px] border border-line bg-panel/90 p-5">
        <form onSubmit={onSubmit} className="flex flex-col gap-3 md:flex-row">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="输入人名、产品名、缩写，如 OpenAI、Claude、Qwen"
            className="flex-1 rounded-2xl border border-line bg-white px-4 py-3"
          />
          <button type="submit" className="rounded-full bg-accent px-4 py-2 text-white">
            添加热词
          </button>
        </form>

        <div className="mt-5 flex flex-wrap gap-3">
          {tags.length === 0 ? (
            <div className="text-sm text-ink/55">暂无热词。FunASR 会按空输入处理。</div>
          ) : (
            tags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() =>
                  updateSettings({
                    hotwords: tags.filter((item) => item !== tag).join(","),
                  })
                }
                className="rounded-full bg-accentSoft px-4 py-2 text-sm text-ink"
              >
                {tag} ×
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
