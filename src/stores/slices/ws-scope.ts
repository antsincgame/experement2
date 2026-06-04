// WebSocket event scoping: which project is targeted vs which project the user is viewing.
import {
  CREATING_PROJECT_SLUG,
  getPlannedProjectSlug,
  isCreatingRoute,
  isCreationSession,
  isPendingCreation,
} from "@/shared/lib/creation-flow";
import type { IncomingWsMessage } from "@/shared/schemas/ws-messages";
import type { ProjectStoreGet } from "../project-store.types";

const GLOBAL_MESSAGE_TYPES = new Set([
  "connected",
  "lm_studio_status",
  "llm_server_status",
]);

const UNSCOPED_FALLBACK_TYPES = new Set([
  "generation_aborted",
]);

export const getMessageProjectName = (msg: IncomingWsMessage): string | null =>
  "projectName" in msg && typeof msg.projectName === "string"
    ? msg.projectName
    : null;

export const getMessageRequestId = (msg: IncomingWsMessage): string | null =>
  "requestId" in msg && typeof msg.requestId === "string"
    ? msg.requestId
    : null;

/** Backend project the event belongs to (may differ from what the user is viewing). */
export const resolveEventProject = (
  get: ProjectStoreGet,
  msg: IncomingWsMessage,
): string | null => {
  const explicit = getMessageProjectName(msg);
  if (explicit) {
    return explicit;
  }

  const state = get();
  if (isCreationSession(state)) {
    return getPlannedProjectSlug(state.plan) ?? CREATING_PROJECT_SLUG;
  }

  return state.projectName;
};

/**
 * True when the event should mutate the live workspace (chat panel, generation UI).
 * Creation events must match requestId AND the user must be viewing the target project
 * (or the __creating__ placeholder) — prevents hijacking another project's UI.
 */
export const matchesActiveProject = (
  get: ProjectStoreGet,
  msg: IncomingWsMessage,
): boolean => {
  if (GLOBAL_MESSAGE_TYPES.has(msg.type)) {
    return true;
  }

  const messageProjectName = getMessageProjectName(msg);
  const state = get();
  const viewing = state.projectName;

  if (isCreationSession(state)) {
    const creationRequestId = state.pendingCreationRequestId;
    const messageRequestId = getMessageRequestId(msg);

    if (creationRequestId && messageRequestId && messageRequestId !== creationRequestId) {
      return false;
    }
    if (creationRequestId && !messageRequestId) {
      if (messageProjectName && !isCreatingRoute(messageProjectName)) {
        return isCreatingRoute(viewing) || viewing === messageProjectName;
      }
      return isCreatingRoute(viewing);
    }

    const target = resolveEventProject(get, msg);
    if (!viewing) {
      // No active project: nothing to protect, accept.
      return true;
    }
    if (!target) {
      // Can't determine which project owns this event — reject to be safe.
      return false;
    }
    return viewing === target || isCreatingRoute(viewing);
  }

  if (!viewing) {
    return true;
  }

  if (!messageProjectName) {
    return UNSCOPED_FALLBACK_TYPES.has(msg.type);
  }

  return messageProjectName === viewing;
};

export const resolveChatTargetProject = (
  get: ProjectStoreGet,
  msg: IncomingWsMessage,
): string | null => resolveEventProject(get, msg) ?? get().projectName;
