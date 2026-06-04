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

/** True for RFC1918 hosts LM Studio shows as "Reachable at …". */
const isPrivateLanHost = (hostname: string): boolean => {
  const host = hostname.toLowerCase();
  if (LOOPBACK_HOSTS.has(host)) {
    return false;
  }
  // A host explicitly trusted via LM_STUDIO_URL / LM_STUDIO_ALLOWED_HOSTS is an
  // intentional remote model server — never rewrite it to loopback.
  if (host === defaultHost || extraHosts.includes(host)) {
    return false;
  }
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
};

/**
 * LM Studio advertises a LAN IP (e.g. http://10.25.0.6:1234) for other devices.
 * The agent on the same machine must call loopback — the LAN bind is often
 * unreachable from Node on Windows and causes endless "fetch failed" retries.
 * Hosts explicitly allowlisted via env are treated as deliberate and left as-is.
 */
export const normalizeLmStudioUrl = (url: string): string => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  if (!isPrivateLanHost(parsed.hostname)) {
    return url;
  }

  const port = parsed.port || "1234";
  return `${parsed.protocol}//127.0.0.1:${port}`;
};

/**
 * Validate an LLM server URL and return its normalized origin (protocol + host,
 * no path/query). Throws if the protocol or host is not allowed.
 */
export const assertLlmUrl = (url: string): string => {
  const urlForCheck = normalizeLmStudioUrl(url);
  let parsed: URL;
  try {
    parsed = new URL(urlForCheck);
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
