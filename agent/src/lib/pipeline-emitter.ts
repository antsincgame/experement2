// Scoped WS event emitter — one factory for create, resume, and iterate flows.
import type { broadcast as broadcastFn } from "./event-bus.js";
import type { OutboundMessage } from "./ws-contract.js";

export interface PipelineEmitter {
  projectName: string;
  requestId?: string;
  emit: (message: OutboundMessage) => void;
  emitBuildScoped: (buildId: string, message: OutboundMessage) => void;
}

export const createPipelineEmitter = (
  projectName: string,
  broadcast: typeof broadcastFn,
  requestId?: string,
): PipelineEmitter => {
  const emit = (message: OutboundMessage): void => {
    // projectName/requestId are routing fields (optional in OutboundMessage); the
    // spread only attaches them, so the asserted shape is the validated input.
    broadcast({
      ...message,
      ...(requestId ? { requestId } : {}),
      projectName,
    } as OutboundMessage);
  };

  return {
    projectName,
    requestId,
    emit,
    emitBuildScoped: (buildId, message) => emit({ ...message, buildId } as OutboundMessage),
  };
};
