"use client";

import { cn } from "@/lib/utils";
import { SettingsSection, useAppStore } from "@/store/app-store";
import { Cpu, Keyboard, MessageSquare, Settings, Users, History } from "lucide-react";

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> { }

const items: { section: SettingsSection; label: string; icon: React.ElementType }[] = [
    { section: "general", label: "General", icon: Settings },
    { section: "engine", label: "Engine", icon: Cpu },
    { section: "vocabulary", label: "Vocabulary", icon: MessageSquare },
    { section: "speaker", label: "Speaker", icon: Users },
    { section: "hotkey", label: "Hotkey", icon: Keyboard },
    { section: "history", label: "History", icon: History },
];

export function Sidebar({ className }: SidebarProps) {
    const { selectedSection, setSelectedSection } = useAppStore();

    return (
        <div className={cn("pb-12 w-64 border-r bg-muted/20", className)}>
            <div className="space-y-4 py-4">
                <div className="px-3 py-2">
                    <h2 className="mb-2 px-4 text-lg font-semibold tracking-tight">
                        Settings
                    </h2>
                    <div className="space-y-1">
                        {items.map((item) => (
                            <button
                                key={item.section}
                                onClick={() => setSelectedSection(item.section)}
                                className={cn(
                                    "flex w-full items-center rounded-md px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground",
                                    selectedSection === item.section
                                        ? "bg-accent text-accent-foreground"
                                        : "transparent"
                                )}
                            >
                                <item.icon className="mr-2 h-4 w-4" />
                                {item.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
