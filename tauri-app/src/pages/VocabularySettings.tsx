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
        <h1 className="text-3xl font-semibold">词汇</h1>
        <p className="max-w-3xl text-sm leading-6 text-ink/65">
          和原版一样，这里只管理热词输入体验，不改变后端逗号分隔的存储格式。
        </p>
      </header>

      <section className="rounded-[28px] border border-line bg-panel/90 p-5">
        <form onSubmit={onSubmit} className="flex flex-col gap-3 md:flex-row">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="输入人名、术语、品牌名，例如 OpenAI、Claude、Qwen"
            className="flex-1 rounded-2xl border border-line bg-white px-4 py-3"
          />
          <button type="submit" className="rounded-full bg-accent px-4 py-2 text-white">
            添加
          </button>
        </form>

        <div className="mt-5 min-h-[140px] rounded-[24px] border border-dashed border-line bg-white/70 px-4 py-4">
          {tags.length === 0 ? (
            <div className="text-sm text-ink/55">暂无自定义词汇。</div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {tags.map((tag) => (
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
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between text-sm text-ink/60">
          <span>{tags.length} 个词汇</span>
          <button
            type="button"
            onClick={() => updateSettings({ hotwords: "" })}
            className="rounded-full border border-line px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={tags.length === 0}
          >
            清空全部
          </button>
        </div>
      </section>
    </div>
  );
}
