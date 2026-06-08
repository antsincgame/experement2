// Centralizes frontend defaults so Expo can override endpoints via EXPO_PUBLIC_* variables.
export const AGENT_HTTP_URL =
  process.env.EXPO_PUBLIC_AGENT_URL?.trim() || "http://localhost:3100";

/** Mirrors server AGENT_LOCAL_TOKEN when set — required for HTTP/WS when auth is enabled. */
export const AGENT_LOCAL_TOKEN =
  process.env.EXPO_PUBLIC_AGENT_TOKEN?.trim() || "";

export const LM_STUDIO_DEFAULT_URL =
  process.env.EXPO_PUBLIC_LM_STUDIO_URL?.trim() || "http://localhost:1234";

export const METRO_ERROR_MAX_LENGTH = 500;
