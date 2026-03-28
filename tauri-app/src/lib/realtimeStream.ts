import * as backendApi from "../api/backend";
import { useAppStore } from "../stores/appStore";

let socket: WebSocket | null = null;
let summaryTimer: number | null = null;
let summarizedCount = 0;

function clearSummaryTimer() {
  if (summaryTimer !== null) {
    window.clearInterval(summaryTimer);
    summaryTimer = null;
  }
}

function decodeBase64(base64: string): Uint8Array {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function maybeSummarize(force = false) {
  const store = useAppStore.getState();
  const { enableStreaming, enableAISummary } = store.settings;
  if (!enableStreaming || !enableAISummary) {
    return;
  }

  const entries = store.realtime.entries;
  if (!entries.length || (!force && entries.length <= summarizedCount)) {
    return;
  }

  const text = entries
    .slice(summarizedCount)
    .map((entry) => `${entry.speaker ?? "说话人"}: ${entry.text}`)
    .join("\n");

  if (!text.trim()) {
    return;
  }

  const summary = await backendApi.requestSummary(text);
  if (!summary.trim()) {
    return;
  }

  summarizedCount = entries.length;
  useAppStore.getState().pushRealtimeSummary(summary);
}

export function startRealtimeStreamSession() {
  const store = useAppStore.getState();
  if (!store.settings.enableStreaming || socket) {
    return;
  }

  summarizedCount = 0;
  store.resetRealtimeSession();
  store.setRealtimeStatus("recording");

  socket = new WebSocket(`${backendApi.getBaseUrl().replace("http", "ws")}/stream`);
  socket.binaryType = "arraybuffer";

  socket.addEventListener("open", () => {
    useAppStore.getState().setRealtimeStatus("streaming");
    if (useAppStore.getState().settings.enableAISummary) {
      clearSummaryTimer();
      summaryTimer = window.setInterval(() => {
        void maybeSummarize();
      }, 120000);
    }
  });

  socket.addEventListener("message", (event) => {
    try {
      const payload = JSON.parse(String(event.data)) as
        | { type: "entry"; entry: { id: string; speaker: string | null; text: string; timestamp: string | null } }
        | { type: "error"; message: string };

      if (payload.type === "entry") {
        useAppStore.getState().pushRealtimeEntry(payload.entry);
        return;
      }

      useAppStore.getState().setRealtimeError(payload.message);
    } catch {
      useAppStore.getState().setRealtimeError("实时转录消息解析失败");
    }
  });

  socket.addEventListener("error", () => {
    useAppStore.getState().setRealtimeError("实时转录连接失败");
  });

  socket.addEventListener("close", () => {
    socket = null;
    clearSummaryTimer();
  });
}

export function pushRealtimeAudioChunk(base64: string) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }

  try {
    socket.send(decodeBase64(base64));
  } catch {
    useAppStore.getState().setRealtimeError("实时音频块发送失败");
  }
}

export async function stopRealtimeStreamSession() {
  await maybeSummarize(true);
  clearSummaryTimer();
  if (socket) {
    socket.close();
    socket = null;
  }
  useAppStore.getState().setRealtimeStatus("completed");
}

export function cancelRealtimeStreamSession() {
  clearSummaryTimer();
  if (socket) {
    socket.close();
    socket = null;
  }
  summarizedCount = 0;
  useAppStore.getState().resetRealtimeSession();
}
