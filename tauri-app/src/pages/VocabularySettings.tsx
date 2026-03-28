import { FormEvent, useMemo, useState } from "react";
import {
  SettingsField,
  SettingsPage,
  SettingsSection,
  inputClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
} from "../components/settings-ui";
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
    <SettingsPage
      title="词汇"
      description="热词页维持轻量输入和局部列表，避免因为标签过多把整个页面拉长。"
    >
      <SettingsSection
        title="自定义词汇"
        description="添加人名、术语、品牌名等专有名词。该功能主要对 FunASR 热词增强模型更明显。"
        actions={<span className="app-chip">{tags.length} 个词汇</span>}
      >
        <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
          <SettingsField label="输入词汇" hint="例如 OpenAI、Claude、Qwen。">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="输入词汇"
              className={inputClassName}
            />
          </SettingsField>
          <button type="submit" className={primaryButtonClassName}>
            添加
          </button>
          <button
            type="button"
            onClick={() => updateSettings({ hotwords: "" })}
            className={secondaryButtonClassName}
            disabled={tags.length === 0}
          >
            清空
          </button>
        </form>

        <div className="mt-3 rounded-[12px] border border-line bg-panel px-3 py-3">
          <div className="mb-2 flex items-center justify-between text-xs text-ink/55">
            <span>已保存词汇</span>
            <span>局部滚动</span>
          </div>
          <div className="list-scroll max-h-[220px]">
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
                    className="rounded-full border border-line bg-[#f2e5d4] px-3 py-1.5 text-sm text-ink"
                  >
                    {tag} ×
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </SettingsSection>
    </SettingsPage>
  );
}