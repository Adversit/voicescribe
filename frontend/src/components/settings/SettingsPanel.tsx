"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Settings, Cpu, BookOpen, Users, Keyboard, History, Radio } from "lucide-react";
import { GeneralSettings } from "./GeneralSettings";
import { EngineSettings } from "./EngineSettings";
import { VocabularySettings } from "./VocabularySettings";
import { SpeakerSettings } from "./SpeakerSettings";
import { HotkeySettings } from "./HotkeySettings";
import { HistorySettings } from "./HistorySettings";
import { LiveTranscriptPanel } from "../LiveTranscriptPanel";

type SettingsTab = "live-transcript" | "general" | "engine" | "vocabulary" | "speaker" | "hotkey" | "history";

interface NavItem {
    id: SettingsTab;
    label: string;
    icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
    { id: "live-transcript", label: "实时转录", icon: Radio },
    { id: "general", label: "通用", icon: Settings },
    { id: "engine", label: "引擎", icon: Cpu },
    { id: "vocabulary", label: "词汇", icon: BookOpen },
    { id: "speaker", label: "说话人", icon: Users },
    { id: "hotkey", label: "快捷键", icon: Keyboard },
    { id: "history", label: "历史记录", icon: History },
];

export function SettingsPanel() {
    const [activeTab, setActiveTab] = useState<SettingsTab>("live-transcript");

    const renderContent = () => {
        switch (activeTab) {
            case "live-transcript":
                return <LiveTranscriptPanel />;
            case "general":
                return <GeneralSettings />;
            case "engine":
                return <EngineSettings />;
            case "vocabulary":
                return <VocabularySettings />;
            case "speaker":
                return <SpeakerSettings />;
            case "hotkey":
                return <HotkeySettings />;
            case "history":
                return <HistorySettings />;
        }
    };

    return (
        <div className="flex h-full">
            {/* Sidebar Navigation */}
            <nav className="w-48 border-r bg-muted/30 p-2 shrink-0">
                <ul className="space-y-1">
                    {NAV_ITEMS.map((item) => {
                        const Icon = item.icon;
                        const isActive = activeTab === item.id;
                        return (
                            <li key={item.id}>
                                <button
                                    onClick={() => setActiveTab(item.id)}
                                    className={cn(
                                        "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                                        isActive
                                            ? "bg-blue-500 text-white"
                                            : "hover:bg-muted text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    <Icon className="h-4 w-4" />
                                    {item.label}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </nav>

            {/* Content Area */}
            <main className="flex-1 p-6 overflow-y-auto">
                {renderContent()}
            </main>
        </div>
    );
}
