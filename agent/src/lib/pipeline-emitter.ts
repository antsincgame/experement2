// Scoped WS event emitter — one factory for create, resume, and iterate flows.
import type { broadcast as broadcastFn } from "./event-bus.js";

export interface PipelineEmitter {
  projectName: string;
  requestId?: string;
  emit: (message: Record<string, unknown>) => void;
  emitBuildScoped: (buildId: string, message: Record<string, unknown>) => void;
}

export const createPipelineEmitter = (
  projectName: string,
  broadcast: typeof broadcastFn,
  requestId?: string,
): PipelineEmitter => {
  const emit = (message: Record<string, unknown>): void => {
    broadcast({
      ...message,
      ...(requestId ? { requestId } : {}),
      projectName,
    });
  };

  return {
    projectName,
    requestId,
    emit,
    emitBuildScoped: (buildId, message) => emit({ ...message, buildId }),
  };
};
