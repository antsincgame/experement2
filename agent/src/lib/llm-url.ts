// Single chokepoint for validating the LM Studio base URL before it reaches fetch().
//
// The base URL is client-supplied (WebSocket messages, the /complete and /enhance
// request bodies, and the /api/llm/models?url= query), so without this guard a
// caller could point the server's fetch at arbitrary internal hosts (SSRF). We
// allow loopback only by default; LM_STUDIO_ALLOWED_HOSTS can widen it for users
// who run the model server on another machine.

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

const extraHosts = (process.env.LM_STUDIO_ALLOWED_HOSTS ?? "")
  .split(",")
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);

// The server-configured default host is always trusted, so setting
// LM_STUDIO_URL to a remote model server keeps working without extra config.
const defaultHost = (() => {
  try {
    return new URL(process.env.LM_STUDIO_URL ?? "").hostname.toLowerCase();
  } catch {
    return "";
  }
})();

const ALLOWED_LLM_HOSTS = new Set([
  ...LOOPBACK_HOSTS,
  ...(defaultHost ? [defaultHost] : []),
  ...extraHosts,
]);

/**
 * Validate an LLM server URL and return its normalized origin (protocol + host,
 * no path/query). Throws if the protocol or host is not allowed.
 */
export const assertLlmUrl = (url: string): string => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid LLM URL: ${url}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`LLM URL must use http(s): ${url}`);
  }

  if (!ALLOWED_LLM_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error(
      `LLM host not allowed: "${parsed.hostname}". Set LM_STUDIO_ALLOWED_HOSTS to permit it.`
    );
  }

  return `${parsed.protocol}//${parsed.host}`;
};
