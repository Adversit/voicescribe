"use client";

import { useState, useEffect, useRef } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Mic, Square, Trash2, User } from "lucide-react";
import { WavRecorder } from "@/lib/wav-recorder";

interface Speaker {
    id: string;
    name: string;
    speakerId: string;
}

export function SpeakerSettings() {
    const [speakers, setSpeakers] = useState<Speaker[]>([]);
    const [newSpeakerName, setNewSpeakerName] = useState("");
    const [isRecording, setIsRecording] = useState(false);
    const [isRegistering, setIsRegistering] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [recordingDuration, setRecordingDuration] = useState(0);

    const recorderRef = useRef<WavRecorder | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        void loadSpeakers();
    }, []);

    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            recorderRef.current?.cancel();
            recorderRef.current = null;
        };
    }, []);

    const loadSpeakers = async () => {
        if (typeof window !== "undefined" && window.electron) {
            try {
                const backendSpeakers = await window.electron.backend.getSpeakers();
                setSpeakers(
                    backendSpeakers.map((s: { speaker_id: string; name: string }) => ({
                        id: s.speaker_id,
                        name: s.name,
                        speakerId: s.speaker_id,
                    }))
                );
            } catch (err) {
                console.error("Failed to load speakers:", err);
            }
        }
    };

    const startRecording = async () => {
        if (!newSpeakerName.trim()) return;
        if (isRegistering) return;

        setError(null);

        try {
            const recorder = new WavRecorder({ targetSampleRate: 16000, channelCount: 1 });
            recorderRef.current = recorder;
            await recorder.start();

            setIsRecording(true);
            setRecordingDuration(0);

            if (timerRef.current) clearInterval(timerRef.current);
            timerRef.current = setInterval(() => {
                setRecordingDuration((prev) => prev + 1);
            }, 1000);
        } catch (err) {
            setError(`无法访问麦克风: ${err}`);
        }
    };

    const stopRecording = async () => {
        const recorder = recorderRef.current;
        if (!recorder) return;

        setIsRecording(false);

        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }

        recorderRef.current = null;

        let audioBuffer: ArrayBuffer;
        try {
            audioBuffer = await recorder.stop();
        } catch (err) {
            recorder.cancel();
            setError(`录音失败: ${err}`);
            setRecordingDuration(0);
            return;
        }

        setIsRegistering(true);
        try {
            if (typeof window !== "undefined" && window.electron) {
                const result = await window.electron.backend.registerSpeaker(newSpeakerName, audioBuffer);
                if (result.status === "error") {
                    setError(result.error || "注册失败");
                } else {
                    setSpeakers((prev) => [
                        ...prev,
                        {
                            id: result.speaker_id,
                            name: result.name,
                            speakerId: result.speaker_id,
                        },
                    ]);
                    setNewSpeakerName("");
                }
            }
        } catch (err) {
            setError(`注册失败: ${err}`);
        } finally {
            setIsRegistering(false);
            setRecordingDuration(0);
        }
    };

    const deleteSpeaker = async (id: string) => {
        setSpeakers((prev) => prev.filter((s) => s.id !== id));
        if (typeof window !== "undefined" && window.electron) {
            try {
                await window.electron.backend.deleteSpeaker(id);
            } catch (err) {
                console.error("Failed to delete speaker:", err);
            }
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">说话人管理</h3>
                <p className="text-sm text-muted-foreground">
                    注册说话人后，转录时可以自动识别每个人的发言。
                </p>
                <p className="text-sm text-blue-500 mt-1">
                    请在"通用设置"中启用"说话人识别"功能
                </p>
            </div>

            <div className="space-y-4">
                <div className="border rounded-md">
                    {speakers.length === 0 ? (
                        <div className="p-4 text-center text-muted-foreground text-sm">
                            暂无已注册说话人
                        </div>
                    ) : (
                        <div className="divide-y">
                            {speakers.map((speaker) => (
                                <div
                                    key={speaker.id}
                                    className="flex items-center justify-between p-3"
                                >
                                    <div className="flex items-center gap-2">
                                        <User className="h-5 w-5 text-blue-500" />
                                        <span>{speaker.name}</span>
                                        <span className="text-xs text-muted-foreground">
                                            ({speaker.speakerId})
                                        </span>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => void deleteSpeaker(speaker.id)}
                                        disabled={isRegistering}
                                    >
                                        <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="space-y-2">
                    <Label>添加新说话人</Label>
                    <div className="flex gap-2">
                        <Input
                            placeholder="说话人姓名"
                            value={newSpeakerName}
                            onChange={(e) => setNewSpeakerName(e.target.value)}
                            disabled={isRecording || isRegistering}
                        />
                        {isRecording ? (
                            <Button onClick={() => void stopRecording()} variant="destructive">
                                <Square className="h-4 w-4 mr-2" />
                                停止 ({recordingDuration}s)
                            </Button>
                        ) : (
                            <Button
                                onClick={() => void startRecording()}
                                disabled={!newSpeakerName.trim() || isRegistering}
                            >
                                <Mic className="h-4 w-4 mr-2" />
                                {isRegistering ? "注册中..." : "录制声纹"}
                            </Button>
                        )}
                    </div>
                    {error && <p className="text-xs text-red-500">{error}</p>}
                    <p className="text-xs text-muted-foreground">
                        录制 5-10 秒的该说话人独白作为声纹样本
                    </p>
                </div>
            </div>
        </div>
    );
}
