// Pure WebSocket-resilience policy, kept free of store imports so it stays unit-testable
// without the persist/async-storage chain:
//   - reconnect resync decision (audit C4)
//   - dropped-message diagnostic (audit M5)
import { isCreatingRoute } from "@/shared/lib/creation-flow";

// Non-terminal statuses where a mid-flight project may have missed a terminal event
// during a disconnect, so a reconnect should nudge it back into sync.
const STALE_ACTIVE_STATUSES = new Set([
  "planning",
  "scaffolding",
  "generating",
  "analyzing",
  "building",
  "validating",
]);

/**
 * True when a reconnect should re-sync the active project: it was mid-flight in a
 * non-terminal status and may have missed a terminal event during the disconnect. The
 * "__creating__" slug is a UI placeholder with no backend project, so it is never
 * resynced (a preview/status request for it would 404).
 */
export const shouldResyncActiveProjectOnReconnect = (
  projectName: string | null,
  status: string,
): boolean =>
  !!projectName && !isCreatingRoute(projectName) && STALE_ACTIVE_STATUSES.has(status);

/**
 * Identify a message the agent sent that FAILED the IncomingWsMessage schema, so a
 * silently-dropped event (parseIncomingWsMessage → null) becomes traceable in the
 * diagnostic log instead of a generic "unknown shape" (audit M5).
 */
export const describeDroppedMessage = (parsed: unknown, raw: string): string => {
  const type =
    parsed && typeof parsed === "object" && "type" in parsed
      ? String((parsed as { type: unknown }).type)
      : "(no type field)";
  return `Dropped malformed agent message (type=${type}): ${raw.slice(0, 200)}`;
};
