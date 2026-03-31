// Persists configurable frontend endpoints and generation settings with env-backed defaults.
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  AGENT_HTTP_URL,
  LM_STUDIO_DEFAULT_URL,
} from "@/shared/lib/constants";

interface SettingsState {
  lmStudioUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  maxContextTokens: number;
  agentUrl: string;
  enhancerModel: string;
  enhancerEnabled: boolean;

  setLmStudioUrl: (url: string) => void;
  setModel: (model: string) => void;
  setTemperature: (temp: number) => void;
  setMaxTokens: (tokens: number) => void;
  setMaxContextTokens: (tokens: number) => void;
  setAgentUrl: (url: string) => void;
  setEnhancerModel: (model: string) => void;
  setEnhancerEnabled: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      lmStudioUrl: LM_STUDIO_DEFAULT_URL,
      model: "",
      temperature: 0.4,
      maxTokens: 32768,
      maxContextTokens: 65536,
      agentUrl: AGENT_HTTP_URL,
      enhancerModel: "",
      enhancerEnabled: true,

      setLmStudioUrl: (lmStudioUrl) => set({ lmStudioUrl }),
      setModel: (model) => set({ model }),
      setTemperature: (temperature) => set({ temperature }),
      setMaxTokens: (maxTokens) => set({ maxTokens }),
      setMaxContextTokens: (maxContextTokens) => set({ maxContextTokens }),
      setAgentUrl: (agentUrl) => set({ agentUrl }),
      setEnhancerModel: (enhancerModel) => set({ enhancerModel }),
      setEnhancerEnabled: (enhancerEnabled) => set({ enhancerEnabled }),
    }),
    {
      name: "app-factory-settings",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
