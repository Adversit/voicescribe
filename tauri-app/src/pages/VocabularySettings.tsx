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
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-[28px] font-semibold text-ink">词汇</h1>
        <p className="max-w-3xl text-sm leading-6 text-ink/60">
          和原版一样，这里只管理热词输入体验，不改变后端逗号分隔的存储格式。
        </p>
      </header>

      <section className="rounded-[22px] border border-[#e4dbc9] bg-[#faf6ef] p-4">
        <div className="text-base font-semibold text-ink">自定义词汇</div>
        <p className="mt-1 text-sm leading-6 text-ink/55">
          添加人名、术语、品牌名等专有名词。该功能主要对 FunASR 热词增强模型更明显。
        </p>

        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3 md:flex-row">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="输入词汇，例如 OpenAI、Claude、Qwen"
            className="flex-1 rounded-2xl border border-[#ddd2c0] bg-white px-4 py-3"
          />
          <button type="submit" className="rounded-full bg-accent px-4 py-2 text-white">
            添加
          </button>
        </form>

        <div className="mt-4 min-h-[150px] rounded-[20px] border border-dashed border-[#ddd2c0] bg-white px-4 py-4">
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
                  className="rounded-full border border-[#dfc9b7] bg-[#f5e5d7] px-4 py-2 text-sm text-ink"
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
            className="rounded-full border border-[#ddd2c0] bg-white px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={tags.length === 0}
          >
            清空全部
          </button>
        </div>
      </section>
    </div>
  );
}
