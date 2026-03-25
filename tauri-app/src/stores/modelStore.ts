import { create } from "zustand";
import * as backendApi from "../api/backend";
import type { ModelStatus } from "../types";

interface ModelStore {
  models: ModelStatus[];
  refresh: () => Promise<void>;
  startDownload: (engine: string, model: string) => Promise<void>;
  deleteModel: (engine: string, model: string) => Promise<void>;
}

export const useModelStore = create<ModelStore>((set, get) => ({
  models: [],
  refresh: async () => {
    const models = await backendApi.listModels();
    set({ models });
  },
  startDownload: async (engine, model) => {
    await backendApi.downloadModel(engine, model);
    await get().refresh();
  },
  deleteModel: async (engine, model) => {
    await backendApi.deleteModel(engine, model);
    await get().refresh();
  },
}));
