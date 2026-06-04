// Persists configurable frontend endpoints; v1 storage with migrate + explicit field whitelist.

import { create } from "zustand";

import { persist } from "zustand/middleware";

import { createPersistStorage } from "@/shared/lib/storage/persist-storage";

import {

  defaultPersistedSettings,

  flushSettingsToStorage,

  migratePersistedSettings,

  pickPersistedSettings,

  type PersistedSettings,

  SETTINGS_STORAGE_KEY,

  SETTINGS_STORAGE_VERSION,

} from "./settings-persist";

export type SettingsDraft = PersistedSettings;

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

  topP: number;

  maxContextTokens: number;

  agentUrl: string;

  plannerModel: string;

  editorModel: string;

  enhancerModel: string;

  enhancerEnabled: boolean;

  embeddingModel: string;

  semanticRagEnabled: boolean;

  autoPolishEnabled: boolean;

  polishModel: string;

  settingsHydrated: boolean;

  errorLogs: ErrorLogEntry[];



  setLmStudioUrl: (url: string) => void;

  setModel: (model: string) => void;

  setTemperature: (temp: number) => void;

  setMaxTokens: (tokens: number) => void;

  setTopP: (topP: number) => void;

  setMaxContextTokens: (tokens: number) => void;

  setAgentUrl: (url: string) => void;

  setPlannerModel: (model: string) => void;

  setEditorModel: (model: string) => void;

  setEnhancerModel: (model: string) => void;

  setEnhancerEnabled: (enabled: boolean) => void;

  setEmbeddingModel: (model: string) => void;

  setSemanticRagEnabled: (enabled: boolean) => void;

  setAutoPolishEnabled: (enabled: boolean) => void;

  setPolishModel: (model: string) => void;

  addErrorLog: (entry: Omit<ErrorLogEntry, "id" | "timestamp">) => void;

  clearErrorLogs: () => void;

}



const defaults = defaultPersistedSettings();



export const useSettingsStore = create<SettingsState>()(

  persist(

    (set) => ({

      ...defaults,

      settingsHydrated: false,

      errorLogs: [],



      setLmStudioUrl: (lmStudioUrl) => set({ lmStudioUrl, model: "" }),

      setModel: (model) => set({ model }),

      setTemperature: (temperature) => set({ temperature }),

      setMaxTokens: (maxTokens) => set({ maxTokens }),

      setTopP: (topP) => set({ topP }),

      setMaxContextTokens: (maxContextTokens) => set({ maxContextTokens }),

      setAgentUrl: (agentUrl) => set({ agentUrl }),

      setPlannerModel: (plannerModel) => set({ plannerModel }),

      setEditorModel: (editorModel) => set({ editorModel }),

      setEnhancerModel: (enhancerModel) => set({ enhancerModel }),

      setEnhancerEnabled: (enhancerEnabled) => set({ enhancerEnabled }),

      setEmbeddingModel: (embeddingModel) => set({ embeddingModel }),

      setSemanticRagEnabled: (semanticRagEnabled) => set({ semanticRagEnabled }),

      setAutoPolishEnabled: (autoPolishEnabled) => set({ autoPolishEnabled }),

      setPolishModel: (polishModel) => set({ polishModel }),

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

      name: SETTINGS_STORAGE_KEY,

      version: SETTINGS_STORAGE_VERSION,

      storage: createPersistStorage(),

      partialize: (state) => pickPersistedSettings(state),

      migrate: (persisted, version) =>

        migratePersistedSettings(persisted, version),

      merge: (persisted, current) => ({

        ...current,

        ...migratePersistedSettings(persisted, SETTINGS_STORAGE_VERSION),

        settingsHydrated: true,

        errorLogs: current.errorLogs,

      }),

      onRehydrateStorage: () => () => {
        useSettingsStore.setState({ settingsHydrated: true });
      },

    }

  )

);



/** Ensure settings are loaded from disk before reading defaults. */

export const hydrateSettingsStore = async (): Promise<void> => {

  if (useSettingsStore.persist.hasHydrated()) {

    useSettingsStore.setState({ settingsHydrated: true });

    return;

  }

  await useSettingsStore.persist.rehydrate();

  useSettingsStore.setState({ settingsHydrated: true });

};



/** Snapshot current persisted fields for the settings drawer draft. */
export const snapshotSettingsDraft = (): SettingsDraft =>
  pickPersistedSettings(useSettingsStore.getState());

/** Apply drawer draft to the global store and write localStorage immediately. */
export const applySettingsDraft = (draft: SettingsDraft): void => {
  useSettingsStore.setState({
    lmStudioUrl: draft.lmStudioUrl,
    model: draft.model,
    temperature: draft.temperature,
    maxTokens: draft.maxTokens,
    topP: draft.topP,
    maxContextTokens: draft.maxContextTokens,
    agentUrl: draft.agentUrl,
    plannerModel: draft.plannerModel,
    editorModel: draft.editorModel,
    enhancerModel: draft.enhancerModel,
    enhancerEnabled: draft.enhancerEnabled,
    embeddingModel: draft.embeddingModel,
    semanticRagEnabled: draft.semanticRagEnabled,
    autoPolishEnabled: draft.autoPolishEnabled,
    polishModel: draft.polishModel,
  });
  flushSettingsToStorage(draft);
};

export const saveSettingsNow = (): void => {
  flushSettingsToStorage(useSettingsStore.getState());
};

