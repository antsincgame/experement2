import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface SettingsState {
  lmStudioUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  maxContextTokens: number;
  agentUrl: string;

  setLmStudioUrl: (url: string) => void;
  setModel: (model: string) => void;
  setTemperature: (temp: number) => void;
  setMaxTokens: (tokens: number) => void;
  setMaxContextTokens: (tokens: number) => void;
  setAgentUrl: (url: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      lmStudioUrl: "http://localhost:1234",
      model: "",
      temperature: 0.4,
      maxTokens: 32768,
      maxContextTokens: 65536,
      agentUrl: "http://localhost:3100",

      setLmStudioUrl: (lmStudioUrl) => set({ lmStudioUrl }),
      setModel: (model) => set({ model }),
      setTemperature: (temperature) => set({ temperature }),
      setMaxTokens: (maxTokens) => set({ maxTokens }),
      setMaxContextTokens: (maxContextTokens) => set({ maxContextTokens }),
      setAgentUrl: (agentUrl) => set({ agentUrl }),
    }),
    {
      name: "app-factory-settings",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
