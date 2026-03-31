// Centralizes frontend defaults so Expo can override endpoints via EXPO_PUBLIC_* variables.
export const AGENT_HTTP_URL =
  process.env.EXPO_PUBLIC_AGENT_URL?.trim() || "http://localhost:3100";

export const LM_STUDIO_DEFAULT_URL =
  process.env.EXPO_PUBLIC_LM_STUDIO_URL?.trim() || "http://localhost:1234";

export const GENERATION_MAX_RETRIES = 3;
export const METRO_ERROR_MAX_LENGTH = 500;
export const SEARCH_REPLACE_MARKERS = {
  search: "<<<<<<< SEARCH",
  divider: "=======",
  replace: ">>>>>>> REPLACE",
} as const;
