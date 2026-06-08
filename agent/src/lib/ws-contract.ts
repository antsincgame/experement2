// Single source of truth for the agent's OUTBOUND WebSocket messages: they are
// exactly the frontend's validated IncomingWsMessage contract. By typing broadcast
// against it, a renamed `type` or a missing/mis-typed payload field becomes a
// compile error here — instead of a message the client silently drops on
// parseIncomingWsMessage failure. The frontend schema stays the one definition;
// this module only derives the call-site view of it.
import type { IncomingWsMessage } from "../../../src/shared/schemas/ws-messages.js";

/** The canonical, fully-scoped server→client contract (frontend validates against this). */
export type ServerToClientMessage = IncomingWsMessage;

// Routing fields are injected by the delivery layer, not written at call sites:
//   - projectName, requestId  → event-bus.mergeScopeIntoMessage (from EventScope)
//   - buildId                 → PipelineEmitter.emitBuildScoped
// so they are optional in the call-site view; every other (payload) field is enforced.
type InjectedField = "projectName" | "requestId" | "buildId";

type DistributiveOptional<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, Extract<keyof T, K>> & Partial<Pick<T, Extract<keyof T, K>>>
  : never;

/**
 * A server→client message as written at a broadcast/emit call site: the discriminant
 * `type` and all payload fields are required, the injected routing fields are optional.
 */
export type OutboundMessage = DistributiveOptional<IncomingWsMessage, InjectedField>;
