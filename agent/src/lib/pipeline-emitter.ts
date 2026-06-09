// Scoped WS event emitter — one factory for create, resume, and iterate flows.
import type { broadcast as broadcastFn } from "./event-bus.js";
import { withRouting, type OutboundMessage } from "./ws-contract.js";

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
    broadcast(withRouting(message, { projectName, requestId }));
  };

  return {
    projectName,
    requestId,
    emit,
    emitBuildScoped: (buildId, message) => emit(withRouting(message, { buildId })),
  };
};
