import { create } from "zustand";
import * as backendApi from "../api/backend";
import type { ModelCategory, ModelStatus } from "../types";

interface ModelStore {
  models: ModelStatus[];
  refresh: () => Promise<void>;
  startDownload: (category: ModelCategory, engine: string, model: string) => Promise<void>;
  deleteModel: (category: ModelCategory, engine: string, model: string) => Promise<void>;
}

const POLL_INTERVAL_MS = 1500;
let pollTimer: ReturnType<typeof window.setTimeout> | null = null;

function clearPollTimer() {
  if (pollTimer !== null) {
    window.clearTimeout(pollTimer);
    pollTimer = null;
  }
}

export const useModelStore = create<ModelStore>((set, get) => ({
  models: [],
  refresh: async () => {
    const models = await backendApi.listModels();
    set({ models });
    clearPollTimer();
    if (models.some((model) => model.downloading)) {
      pollTimer = window.setTimeout(() => {
        void get().refresh();
      }, POLL_INTERVAL_MS);
    }
  },
  startDownload: async (category, engine, model) => {
    set((state) => ({
      models: state.models.map((item) =>
        item.category === category && item.engine === engine && item.model === model
          ? {
              ...item,
              downloading: true,
              downloaded_bytes: item.downloaded_bytes ?? 0,
              error: null,
            }
          : item,
      ),
    }));
    await backendApi.downloadModel(category, engine, model);
    await get().refresh();
  },
  deleteModel: async (category, engine, model) => {
    await backendApi.deleteModel(category, engine, model);
    await get().refresh();
  },
}));
