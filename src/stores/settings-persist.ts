// Persisted settings slice: explicit field list, migration, and synchronous flush to storage.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import {
  AGENT_HTTP_URL,
  LM_STUDIO_DEFAULT_URL,
} from "@/shared/lib/constants";

export const SETTINGS_STORAGE_KEY = "app-factory-settings";
export const SETTINGS_STORAGE_VERSION = 1;

export interface PersistedSettings {
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
}

export const defaultPersistedSettings = (): PersistedSettings => ({
  lmStudioUrl: LM_STUDIO_DEFAULT_URL,
  model: "",
  temperature: 0.4,
  maxTokens: 65536,
  topP: 1,
  maxContextTokens: 65536,
  agentUrl: AGENT_HTTP_URL,
  plannerModel: "",
  editorModel: "",
  enhancerModel: "",
  enhancerEnabled: true,
  embeddingModel: "",
  semanticRagEnabled: true,
});

export const pickPersistedSettings = (state: {
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
}): PersistedSettings => ({
  lmStudioUrl: state.lmStudioUrl,
  model: state.model,
  temperature: state.temperature,
  maxTokens: state.maxTokens,
  topP: state.topP,
  maxContextTokens: state.maxContextTokens,
  agentUrl: state.agentUrl,
  plannerModel: state.plannerModel,
  editorModel: state.editorModel,
  enhancerModel: state.enhancerModel,
  enhancerEnabled: state.enhancerEnabled,
  embeddingModel: state.embeddingModel,
  semanticRagEnabled: state.semanticRagEnabled,
});

const asNumber = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const asString = (value: unknown, fallback: string): string =>
  typeof value === "string" ? value : fallback;

const asBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

/** Normalize legacy persisted blobs (v0 or partial) into v1 shape. */
export const migratePersistedSettings = (
  persisted: unknown,
  version: number
): PersistedSettings => {
  const defaults = defaultPersistedSettings();
  const bag = persisted as { state?: Record<string, unknown> };
  const raw =
    version < SETTINGS_STORAGE_VERSION &&
    bag &&
    typeof bag === "object" &&
    "state" in bag &&
    bag.state
      ? bag.state
      : ((persisted ?? {}) as Record<string, unknown>);

  return {
    lmStudioUrl: asString(raw.lmStudioUrl, defaults.lmStudioUrl),
    model: asString(raw.model, defaults.model),
    temperature: asNumber(raw.temperature, defaults.temperature),
    maxTokens: asNumber(raw.maxTokens, defaults.maxTokens),
    topP: asNumber(raw.topP, defaults.topP),
    maxContextTokens: asNumber(raw.maxContextTokens, defaults.maxContextTokens),
    agentUrl: asString(raw.agentUrl, defaults.agentUrl),
    plannerModel: asString(raw.plannerModel, defaults.plannerModel),
    editorModel: asString(raw.editorModel, defaults.editorModel),
    enhancerModel: asString(raw.enhancerModel, defaults.enhancerModel),
    enhancerEnabled: asBoolean(raw.enhancerEnabled, defaults.enhancerEnabled),
    embeddingModel: asString(raw.embeddingModel, defaults.embeddingModel),
    semanticRagEnabled: asBoolean(raw.semanticRagEnabled, defaults.semanticRagEnabled),
  };
};

/** Force-write current settings to localStorage/AsyncStorage (e.g. on drawer close). */
export const flushSettingsToStorage = (state: {
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
}): void => {
  const payload = JSON.stringify({
    state: pickPersistedSettings(state),
    version: SETTINGS_STORAGE_VERSION,
  });

  if (Platform.OS === "web" && typeof globalThis.localStorage !== "undefined") {
    globalThis.localStorage.setItem(SETTINGS_STORAGE_KEY, payload);
    return;
  }

  void AsyncStorage.setItem(SETTINGS_STORAGE_KEY, payload);
};
