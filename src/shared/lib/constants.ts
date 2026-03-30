export const AGENT_HTTP_URL = "http://localhost:3100";
export const AGENT_WS_URL = "ws://localhost:3100";
export const LM_STUDIO_DEFAULT_URL = "http://localhost:1234";

export const GENERATION_MAX_RETRIES = 3;
export const METRO_ERROR_MAX_LENGTH = 500;
export const SEARCH_REPLACE_MARKERS = {
  search: "<<<<<<< SEARCH",
  divider: "=======",
  replace: ">>>>>>> REPLACE",
} as const;
