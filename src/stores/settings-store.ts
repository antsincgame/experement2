// Persists configurable frontend endpoints through a cross-platform storage adapter for Expo targets.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  AGENT_HTTP_URL,
  LM_STUDIO_DEFAULT_URL,
} from "@/shared/lib/constants";
import { createPersistStorage } from "@/shared/lib/storage/persist-storage";

export interface ErrorLogEntry {
  id: string;
  timestamp: number;
  level: "error" | "warn" | "info";
  source: string;
  message: string;
  details?: string;
}

interface SettingsState {
  lmStudioUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  maxContextTokens: number;
  agentUrl: string;
  plannerModel: string;
  enhancerModel: string;
  enhancerEnabled: boolean;
  errorLogs: ErrorLogEntry[];

  setLmStudioUrl: (url: string) => void;
  setModel: (model: string) => void;
  setTemperature: (temp: number) => void;
  setMaxTokens: (tokens: number) => void;
  setMaxContextTokens: (tokens: number) => void;
  setAgentUrl: (url: string) => void;
  setPlannerModel: (model: string) => void;
  setEnhancerModel: (model: string) => void;
  setEnhancerEnabled: (enabled: boolean) => void;
  addErrorLog: (entry: Omit<ErrorLogEntry, "id" | "timestamp">) => void;
  clearErrorLogs: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      lmStudioUrl: LM_STUDIO_DEFAULT_URL,
      model: "",
      temperature: 0.4,
      maxTokens: 65536,
      maxContextTokens: 65536,
      agentUrl: AGENT_HTTP_URL,
      plannerModel: "",
      enhancerModel: "",
      enhancerEnabled: true,
      errorLogs: [],

      setLmStudioUrl: (lmStudioUrl) => set({ lmStudioUrl, model: "" }), // clear model on URL change
      setModel: (model) => set({ model }),
      setTemperature: (temperature) => set({ temperature }),
      setMaxTokens: (maxTokens) => set({ maxTokens }),
      setMaxContextTokens: (maxContextTokens) => set({ maxContextTokens }),
      setAgentUrl: (agentUrl) => set({ agentUrl }),
      setPlannerModel: (plannerModel) => set({ plannerModel }),
      setEnhancerModel: (enhancerModel) => set({ enhancerModel }),
      setEnhancerEnabled: (enhancerEnabled) => set({ enhancerEnabled }),
      addErrorLog: (entry) =>
        set((s) => ({
          errorLogs: [
            ...s.errorLogs.slice(-199),
            { ...entry, id: crypto.randomUUID(), timestamp: Date.now() },
          ],
        })),
      clearErrorLogs: () => set({ errorLogs: [] }),
    }),
    {
      name: "app-factory-settings",
      storage: createPersistStorage(),
      partialize: (state) => {
        const { errorLogs: _logs, addErrorLog: _add, clearErrorLogs: _clear, ...persisted } = state;
        return persisted;
      },
    }
  )
);
