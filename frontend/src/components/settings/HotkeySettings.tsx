"use client";

import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Keyboard } from "lucide-react";

// Keep this list aligned with the macOS app's available keys.
const AVAILABLE_KEYS = [
    "无",
    "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
    "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
    "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
    "Space", "-", "=",
];

interface HotkeyConfig {
    useCommand: boolean;
    useShift: boolean;
    useOption: boolean;
    useControl: boolean;
    selectedKey: string;
}

export function HotkeySettings() {
    const [config, setConfig] = useState<HotkeyConfig>({
        useCommand: false,
        useShift: false,
        useOption: true,
        useControl: false,
        selectedKey: "R",
    });

    useEffect(() => {
        if (typeof window !== "undefined" && window.electron?.hotkey) {
            window.electron.hotkey.get().then((savedConfig: unknown) => {
                if (savedConfig) setConfig(savedConfig as HotkeyConfig);
            });
        }
    }, []);

    const hasValidModifier = config.useControl || config.useOption || config.useShift || config.useCommand;

    const previewHotkey = () => {
        const parts: string[] = [];
        if (config.useControl) parts.push("Ctrl");
        if (config.useOption) parts.push("Alt");
        if (config.useShift) parts.push("Shift");
        if (config.useCommand) parts.push("Win");
        if (config.selectedKey !== "无") parts.push(config.selectedKey);
        return parts.length > 0 ? parts.join(" + ") : "未设置";
    };

    const applyHotkey = async () => {
        if (typeof window !== "undefined" && window.electron?.hotkey) {
            const res = await window.electron.hotkey.update(config);
            if (!res?.success) {
                console.error("Failed to update hotkey");
            }
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">录音快捷键</h3>
            </div>

            <div className="space-y-4">
                <div className="space-y-2">
                    <Label>修饰键（至少选择一个）</Label>
                    <div className="flex flex-wrap gap-4">
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="ctrl"
                                checked={config.useControl}
                                onCheckedChange={(checked) =>
                                    setConfig({ ...config, useControl: checked === true })
                                }
                            />
                            <Label htmlFor="ctrl" className="font-normal">Ctrl</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="alt"
                                checked={config.useOption}
                                onCheckedChange={(checked) =>
                                    setConfig({ ...config, useOption: checked === true })
                                }
                            />
                            <Label htmlFor="alt" className="font-normal">Alt</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="shift"
                                checked={config.useShift}
                                onCheckedChange={(checked) =>
                                    setConfig({ ...config, useShift: checked === true })
                                }
                            />
                            <Label htmlFor="shift" className="font-normal">Shift</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="win"
                                checked={config.useCommand}
                                onCheckedChange={(checked) =>
                                    setConfig({ ...config, useCommand: checked === true })
                                }
                            />
                            <Label htmlFor="win" className="font-normal">Win</Label>
                        </div>
                    </div>
                </div>

                <div className="space-y-2">
                    <Label>附加按键（可选）</Label>
                    <Select
                        value={config.selectedKey}
                        onValueChange={(value) => setConfig({ ...config, selectedKey: value })}
                    >
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="选择按键" />
                        </SelectTrigger>
                        <SelectContent>
                            {AVAILABLE_KEYS.map((key) => (
                                <SelectItem key={key} value={key}>
                                    {key === "无" ? "无（仅修饰键）" : key}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                    <Keyboard className="h-5 w-5 text-blue-500" />
                    <div>
                        <p className="text-sm text-muted-foreground">当前快捷键</p>
                        <p className="font-medium text-green-500">{previewHotkey()}</p>
                    </div>
                </div>

                {!hasValidModifier && (
                    <p className="text-sm text-red-500">至少需要选择一个修饰键</p>
                )}
                {hasValidModifier && (
                    <p className="text-sm text-muted-foreground">新快捷键预览: {previewHotkey()}</p>
                )}

                <Button onClick={() => void applyHotkey()} disabled={!hasValidModifier}>
                    应用快捷键
                </Button>

                <div className="space-y-4 pt-4 border-t">
                    <h4 className="font-medium">使用方式</h4>
                    <div className="space-y-3 text-sm">
                        <div className="flex items-start gap-3">
                            <span className="text-blue-500">-</span>
                            <div>
                                <p className="font-medium">切换录音</p>
                                <p className="text-muted-foreground">按一次开始录音，再按一次停止并转写</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <span className="text-green-500">-</span>
                            <div>
                                <p className="font-medium">托盘控制</p>
                                <p className="text-muted-foreground">点击托盘图标也可以开始/停止录音</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <span className="text-orange-500">-</span>
                            <div>
                                <p className="font-medium">取消</p>
                                <p className="text-muted-foreground">录音时点击悬浮窗可取消（不转写）</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
