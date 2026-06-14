import { useEffect, useRef, useState } from "react";
import * as backendApi from "../api/backend";
import {
  SettingsField,
  SettingsPage,
  SettingsSection,
  dangerButtonClassName,
  inputClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
  selectClassName,
} from "../components/settings-ui";
import { useAppStore } from "../stores/appStore";
import { copyText } from "../lib/clipboard";
import type { AgentProvider, AgentTask, ProviderReadiness } from "../types";

const providerLabels: Record<AgentProvider, string> = {
  claude_cli: "Claude Code CLI",
  codex_cli: "Codex CLI",
  codex_sdk: "Codex SDK",
};

const terminalStatuses = new Set(["completed", "cancelled", "failed"]);

export function AgentPage() {
  const backendConnected = useAppStore((state) => state.backendConnected);
  const setToast = useAppStore((state) => state.setToast);
  const [prompt, setPrompt] = useState("");
  const [provider, setProvider] = useState<AgentProvider>("codex_cli");
  const [model, setModel] = useState("");
  const [task, setTask] = useState<AgentTask | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<ProviderReadiness[]>([]);
  const [probing, setProbing] = useState(false);
  const activeTaskId = useRef<string | null>(null);
  const isActive = task !== null && !terminalStatuses.has(task.status);
  const selectedReadiness = readiness.find((item) => item.provider === provider) ?? null;
  const selectedProviderUnavailable = selectedReadiness?.status === "unavailable";
  const capability = provider === "claude_cli" ? "仅根据输入回答，不读取仓库" : "只读分析当前 VoiceScribe 仓库";

  useEffect(() => {
    if (!backendConnected) {
      setReadiness([]);
    }
  }, [backendConnected]);

  useEffect(() => {
    if (!activeTaskId.current || !isActive) {
      return;
    }
    const taskId = activeTaskId.current;
    const timer = window.setInterval(() => {
      void backendApi.getAgentTask(taskId)
        .then((next) => {
          if (activeTaskId.current !== taskId) {
            return;
          }
          setRequestError(null);
          setTask(next);
          if (terminalStatuses.has(next.status)) {
            activeTaskId.current = null;
          }
        })
        .catch((error: unknown) => {
          if (activeTaskId.current !== taskId) {
            return;
          }
          setRequestError(error instanceof Error ? error.message : "Agent 任务状态读取失败");
        });
    }, 500);
    return () => window.clearInterval(timer);
  }, [isActive, task?.task_id]);

  async function startTask() {
    const value = prompt.trim();
    if (!value) {
      setRequestError("请输入 Agent 任务。");
      return;
    }
    setRequestError(null);
    try {
      const next = await backendApi.startAgentTask({
        prompt: value,
        provider,
        model: model.trim(),
        timeout_seconds: 120,
      });
      activeTaskId.current = next.task_id;
      setTask(next);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Agent 任务启动失败");
    }
  }

  async function cancelTask() {
    if (!activeTaskId.current) {
      return;
    }
    try {
      const next = await backendApi.cancelAgentTask(activeTaskId.current);
      activeTaskId.current = null;
      setTask(next);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Agent 任务取消失败");
    }
  }

  async function probeProviders() {
    setProbing(true);
    setRequestError(null);
    try {
      setReadiness(await backendApi.probeAgentProviders());
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Agent 运行时检测失败");
    } finally {
      setProbing(false);
    }
  }

  return (
    <SettingsPage
      title="只读 Agent"
      description="独立调用本机 Claude Code、Codex CLI 或 Codex SDK。任务不会写入转录历史，也不会修改仓库。"
    >
      <SettingsSection
        title="运行边界"
        description="首阶段固定使用当前 VoiceScribe 仓库，且不接受任意工作目录。检测只检查安装状态，不启动 Agent 会话。"
        actions={
          <button
            type="button"
            className={secondaryButtonClassName}
            disabled={!backendConnected || probing || isActive}
            onClick={() => void probeProviders()}
          >
            {probing ? "检测中..." : "检测运行时"}
          </button>
        }
      >
        <div className="flex flex-wrap gap-2 text-sm text-ink/70">
          <span className="app-chip">模式：单轮只读</span>
          <span className="app-chip">能力：{capability}</span>
          <span className="app-chip">缓存：仓库 models/</span>
          {readiness.map((item) => (
            <span key={item.provider} className="app-chip" title={item.detail}>
              {providerLabels[item.provider as AgentProvider]}：{item.status === "ready" ? "已就绪" : "不可用"}
            </span>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection
        title="新任务"
        description="Codex CLI/SDK 可读取仓库；Claude Code 首阶段禁用全部工具。"
        actions={
          isActive ? (
            <button type="button" className={dangerButtonClassName} onClick={() => void cancelTask()}>
              取消任务
            </button>
          ) : (
            <button
              type="button"
              className={primaryButtonClassName}
              disabled={!backendConnected || !prompt.trim() || selectedProviderUnavailable}
              onClick={() => void startTask()}
            >
              启动任务
            </button>
          )
        }
      >
        <div className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <SettingsField label="Provider" hint={capability}>
              <select
                className={selectClassName}
                value={provider}
                disabled={isActive}
                onChange={(event) => setProvider(event.target.value as AgentProvider)}
              >
                {Object.entries(providerLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </SettingsField>
            <SettingsField label="模型（可选）" hint="留空时使用本机 Provider 默认模型。">
              <input
                className={inputClassName}
                value={model}
                disabled={isActive}
                maxLength={200}
                onChange={(event) => setModel(event.target.value)}
                placeholder="默认模型"
              />
            </SettingsField>
          </div>
          <SettingsField label="任务" hint={`${prompt.length}/20000`}>
            <textarea
              className={`${inputClassName} min-h-36 resize-y`}
              value={prompt}
              disabled={isActive}
              maxLength={20000}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="例如：分析当前仓库的后端服务边界，并列出三个最高风险点。"
            />
          </SettingsField>
          {!backendConnected ? <div className="text-sm text-red-700">后端服务尚未就绪。</div> : null}
          {selectedProviderUnavailable ? <div className="text-sm text-red-700">当前 Provider 检测为不可用，请切换或修复本机运行时。</div> : null}
          {requestError ? <div className="text-sm text-red-700">{requestError}</div> : null}
        </div>
      </SettingsSection>

      <SettingsSection
        title="任务结果"
        description="结果只显示在当前页面，不写入转录 history。"
        actions={
          <>
            <button
              type="button"
              className={secondaryButtonClassName}
              disabled={!task?.result?.output}
              onClick={() =>
                void copyText(task?.result?.output ?? "")
                  .then(() => setToast("已复制 Agent 结果"))
                  .catch((error) => setToast(error instanceof Error ? error.message : "复制失败"))
              }
            >
              复制结果
            </button>
            <button
              type="button"
              className={secondaryButtonClassName}
              disabled={isActive || task === null}
              onClick={() => {
                activeTaskId.current = null;
                setTask(null);
                setRequestError(null);
              }}
            >
              清空结果
            </button>
          </>
        }
      >
        <div className="mb-3 flex flex-wrap gap-2 text-sm text-ink/70">
          <span className="app-chip">状态：{task?.status ?? "idle"}</span>
          {task?.result ? <span className="app-chip">耗时：{task.result.duration_ms} ms</span> : null}
          {task?.result ? <span className="app-chip">能力：{task.result.capability}</span> : null}
        </div>
        <pre className="list-scroll min-h-36 whitespace-pre-wrap rounded-[12px] border border-line bg-panel px-4 py-3 text-sm leading-6 text-ink">
          {task?.result?.output ?? task?.error ?? (task?.status === "cancelled" ? "任务已取消。" : "尚无 Agent 输出。")}
        </pre>
      </SettingsSection>
    </SettingsPage>
  );
}
