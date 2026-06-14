// Optional shared secret for local HTTP + WebSocket — disabled when AGENT_LOCAL_TOKEN is unset.
import type { IncomingMessage } from "node:http";
import { timingSafeEqual } from "node:crypto";

const readLocalToken = (): string => process.env.AGENT_LOCAL_TOKEN?.trim() ?? "";

export const isLocalAuthEnabled = (): boolean => readLocalToken().length > 0;

/** Loopback hosts the agent may bind to without auth (trust boundary = this machine). */
export const isLoopbackBindHost = (host: string): boolean => {
  const normalized = host.trim().toLowerCase();
  if (normalized === "localhost" || normalized === "::1") {
    return true;
  }
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized);
};

/**
 * When the agent binds to a non-loopback address (a LAN IP or 0.0.0.0/all-interfaces)
 * WITHOUT a shared token, any device on the network can drive the LLM, write project
 * files, and spawn Metro. Returns a startup warning for that case, or null when the
 * bind is safe (loopback, or auth enabled). The default bind is 127.0.0.1.
 */
export const describeInsecureBind = (host: string, authEnabled: boolean): string | null => {
  if (isLoopbackBindHost(host) || authEnabled) {
    return null;
  }
  return (
    `Agent is bound to non-loopback host "${host}" WITHOUT auth — any device on the ` +
    `network can drive the LLM, write files, and spawn Metro. Set AGENT_LOCAL_TOKEN to ` +
    `require a shared secret, or AGENT_HOST=127.0.0.1 for local-only use.`
  );
};

const tokensMatch = (provided: string): boolean => {
  const expected = Buffer.from(readLocalToken(), "utf8");
  const actual = Buffer.from(provided, "utf8");
  if (expected.length !== actual.length) {
    return false;
  }
  return timingSafeEqual(expected, actual);
};

export const readHttpToken = (req: IncomingMessage): string | null => {
  const header = req.headers["x-agent-token"];
  if (typeof header === "string" && header.trim()) {
    return header.trim();
  }
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    return auth.slice("Bearer ".length).trim();
  }
  return null;
};

export const verifyHttpToken = (req: IncomingMessage): boolean => {
  if (!isLocalAuthEnabled()) {
    return true;
  }
  const provided = readHttpToken(req);
  return provided !== null && tokensMatch(provided);
};

export const readWsToken = (req: IncomingMessage): string | null => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const queryToken = url.searchParams.get("token");
    if (queryToken?.trim()) {
      return queryToken.trim();
    }
  } catch {
    return null;
  }
  return null;
};

export const verifyWsToken = (req: IncomingMessage): boolean => {
  if (!isLocalAuthEnabled()) {
    return true;
  }
  const provided = readWsToken(req);
  return provided !== null && tokensMatch(provided);
};
