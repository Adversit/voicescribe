import type {
  EngineInfo,
  HistoryRecord,
  ModelStatus,
  SpeakerInfo,
} from "../types";

const BASE_URL = "http://127.0.0.1:8765";

async function ensureOk(response: Response) {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
}

export function getBaseUrl() {
  return BASE_URL;
}

export async function healthCheck(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

export async function listEngines(): Promise<EngineInfo[]> {
  const response = await fetch(`${BASE_URL}/engines`);
  await ensureOk(response);
  return response.json();
}

export async function loadEngine(engine: string, model: string): Promise<void> {
  const response = await fetch(`${BASE_URL}/load`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ engine, model }).toString(),
  });
  await ensureOk(response);
}

export async function listModels(): Promise<ModelStatus[]> {
  const response = await fetch(`${BASE_URL}/models`);
  await ensureOk(response);
  return response.json();
}

export async function downloadModel(engine: string, model: string): Promise<void> {
  const response = await fetch(`${BASE_URL}/models/download`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ engine, model }).toString(),
  });
  await ensureOk(response);
}

export async function deleteModel(engine: string, model: string): Promise<void> {
  const response = await fetch(`${BASE_URL}/models/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ engine, model }).toString(),
  });
  await ensureOk(response);
}

export async function listSpeakers(): Promise<SpeakerInfo[]> {
  const response = await fetch(`${BASE_URL}/speakers`);
  await ensureOk(response);
  const payload = (await response.json()) as { speakers: SpeakerInfo[] };
  return payload.speakers;
}

export async function deleteSpeaker(speakerId: string): Promise<void> {
  const response = await fetch(`${BASE_URL}/speakers/${speakerId}`, {
    method: "DELETE",
  });
  await ensureOk(response);
}

export async function registerSpeakerSample(name: string, file: File): Promise<SpeakerInfo> {
  const form = new FormData();
  form.set("name", name);
  form.set("audio", file, file.name);

  const response = await fetch(`${BASE_URL}/speakers/register`, {
    method: "POST",
    body: form,
  });
  await ensureOk(response);
  return response.json();
}

export async function listHistory(): Promise<HistoryRecord[]> {
  const response = await fetch(`${BASE_URL}/history`);
  await ensureOk(response);
  const payload = (await response.json()) as { records: HistoryRecord[] };
  return payload.records;
}

export async function saveHistory(record: HistoryRecord): Promise<void> {
  const response = await fetch(`${BASE_URL}/history`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record),
  });
  await ensureOk(response);
}

export async function deleteHistoryRecord(recordId: string): Promise<void> {
  const response = await fetch(`${BASE_URL}/history/${recordId}`, {
    method: "DELETE",
  });
  await ensureOk(response);
}

export async function clearHistory(): Promise<void> {
  const response = await fetch(`${BASE_URL}/history`, {
    method: "DELETE",
  });
  await ensureOk(response);
}

async function downloadBlob(url: string, filename: string) {
  const response = await fetch(url);
  await ensureOk(response);
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(blobUrl);
}

export async function downloadHistoryText(recordId: string) {
  await downloadBlob(`${BASE_URL}/history/${recordId}/download/text`, `voicescribe-history-${recordId}.txt`);
}

export async function downloadHistoryAudio(recordId: string, fallbackName?: string) {
  await downloadBlob(`${BASE_URL}/history/${recordId}/download/audio`, fallbackName ?? `voicescribe-history-${recordId}.wav`);
}

export async function requestSummary(text: string): Promise<string> {
  const response = await fetch(`${BASE_URL}/summary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  await ensureOk(response);
  const payload = (await response.json()) as { summary: string };
  return payload.summary;
}
