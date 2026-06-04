// Shared origin allowlist for HTTP CORS and the WebSocket verifyClient gate.
//
// Browsers do NOT apply same-origin to WebSocket, so a malicious page the victim
// has open could otherwise `new WebSocket("ws://127.0.0.1:3100")` and drive
// create_project/iterate/revert. The Origin header — which browsers always send on
// the upgrade — is checked against this allowlist before the socket is accepted.

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:8081",
  "http://localhost:8082",
  "http://127.0.0.1:8081",
];

/** Allowed origins from AGENT_ALLOWED_ORIGINS (csv), or the localhost defaults. */
export const getAllowedOrigins = (): string[] =>
  process.env.AGENT_ALLOWED_ORIGINS
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
  ?? DEFAULT_ALLOWED_ORIGINS;

/**
 * A browser page always sends an Origin header; the cross-site threat is such a
 * page, so an Origin that is present but NOT allow-listed is rejected. Non-browser
 * local clients (native app, CLI tooling) send no Origin and are allowed — they are
 * not the cross-site vector and blocking them would break legitimate local use.
 */
export const isOriginAllowed = (
  origin: string | undefined | null,
  allowed: string[] = getAllowedOrigins()
): boolean => {
  if (!origin) {
    return true;
  }
  return allowed.includes(origin);
};
