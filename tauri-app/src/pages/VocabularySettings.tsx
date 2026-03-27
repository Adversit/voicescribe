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
    <div className="space-y-3.5">
      <header className="space-y-1">
        <h1 className="text-[22px] font-semibold text-ink">词汇</h1>
        <p className="max-w-3xl text-xs leading-5 text-ink/60">
          热词页保持输入简单、标签区局部滚动，避免标签过多时拉长整个页面。
        </p>
      </header>

      <section className="rounded-[18px] border border-[#e4dbc9] bg-[#faf6ef] px-4 py-3">
        <div className="text-[15px] font-semibold text-ink">自定义词汇</div>
        <p className="mt-1 text-xs leading-5 text-ink/55">
          添加人名、术语、品牌名等专有名词。该功能主要对 FunASR 热词增强模型更明显。
        </p>

        <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-2 md:flex-row">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="输入词汇，例如 OpenAI、Claude、Qwen"
            className="flex-1 rounded-2xl border border-[#ddd2c0] bg-white px-4 py-2.5"
          />
          <button type="submit" className="rounded-full bg-accent px-4 py-2 text-white">
            添加
          </button>
          <button
            type="button"
            onClick={() => updateSettings({ hotwords: "" })}
            className="rounded-full border border-[#ddd2c0] bg-white px-4 py-2 text-ink/75 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={tags.length === 0}
          >
            清空
          </button>
        </form>

        <div className="mt-3 rounded-[18px] border border-dashed border-[#ddd2c0] bg-white px-3 py-3">
          <div className="mb-2 flex items-center justify-between text-xs text-ink/55">
            <span>{tags.length} 个词汇</span>
            <span>超过高度后局部滚动</span>
          </div>
          <div className="max-h-[250px] overflow-y-auto pr-1">
            {tags.length === 0 ? (
              <div className="text-sm text-ink/55">暂无自定义词汇。</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() =>
                      updateSettings({
                        hotwords: tags.filter((item) => item !== tag).join(","),
                      })
                    }
                    className="rounded-full border border-[#dfc9b7] bg-[#f5e5d7] px-3 py-1.5 text-sm text-ink"
                  >
                    {tag} ×
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
