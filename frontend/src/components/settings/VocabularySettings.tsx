"use client";

import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export function VocabularySettings() {
    const [hotwords, setHotwords] = useState<string[]>([]);
    const [newWord, setNewWord] = useState("");

    useEffect(() => {
        // Load hotwords from Electron store
        const loadHotwords = async () => {
            if (typeof window !== 'undefined' && window.electron) {
                try {
                    const settings = await window.electron.settings.get();
                    setHotwords(settings.vocabulary || []);
                } catch (err) {
                    console.error('Failed to load vocabulary:', err);
                }
            }
        };
        loadHotwords();
    }, []);

    const saveVocabulary = (words: string[]) => {
        if (typeof window !== 'undefined' && window.electron) {
            window.electron.settings.update({ vocabulary: words });
        }
    };

    const addWord = () => {
        const word = newWord.trim();
        if (!word || hotwords.includes(word)) return;
        const updated = [...hotwords, word];
        setHotwords(updated);
        setNewWord("");
        saveVocabulary(updated);
    };

    const removeWord = (wordToRemove: string) => {
        const updated = hotwords.filter((word) => word !== wordToRemove);
        setHotwords(updated);
        saveVocabulary(updated);
    };

    const clearAll = () => {
        setHotwords([]);
        saveVocabulary([]);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            e.preventDefault();
            addWord();
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">自定义词汇</h3>
                <p className="text-sm text-muted-foreground">
                    添加人名、术语、品牌名等专有名词，可提高识别准确率。<br />此功能主要对 FunASR 引擎有效。
                </p>
            </div>

            {/* Add Word */}
            <div className="space-y-2">
                <Label>添加词汇</Label>
                <div className="flex gap-2">
                    <Input
                        placeholder="输入词汇"
                        value={newWord}
                        onChange={(e) => setNewWord(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="flex-1"
                    />
                    <Button onClick={addWord} disabled={!newWord.trim()}>
                        添加
                    </Button>
                </div>
            </div>

            {/* Word List - Flow Layout */}
            <div className="space-y-2">
                <Label>已添加词汇</Label>
                {hotwords.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground text-sm border rounded-md">
                        暂无自定义词汇
                    </div>
                ) : (
                    <div className="border rounded-md p-4 min-h-[150px] max-h-[200px] overflow-y-auto">
                        <div className="flex flex-wrap gap-2">
                            {hotwords.map((word) => (
                                <div
                                    key={word}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-muted rounded-full text-sm group hover:bg-muted/80 transition-colors"
                                >
                                    <span>{word}</span>
                                    <button
                                        onClick={() => removeWord(word)}
                                        className="text-muted-foreground hover:text-foreground transition-colors"
                                        title={`删除 ${word}`}
                                        aria-label={`删除 ${word}`}
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-2 border-t">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAll}
                    disabled={hotwords.length === 0}
                >
                    清空全部
                </Button>
                <span className="text-sm text-muted-foreground">
                    {hotwords.length} 个词汇
                </span>
            </div>
        </div>
    );
}
