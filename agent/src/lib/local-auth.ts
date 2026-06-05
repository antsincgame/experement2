// Optional shared secret for local HTTP + WebSocket — disabled when AGENT_LOCAL_TOKEN is unset.
import type { IncomingMessage } from "node:http";
import { timingSafeEqual } from "node:crypto";

const readLocalToken = (): string => process.env.AGENT_LOCAL_TOKEN?.trim() ?? "";

export const isLocalAuthEnabled = (): boolean => readLocalToken().length > 0;

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
