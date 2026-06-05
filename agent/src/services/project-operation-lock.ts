// Serializes heavy project operations so overlapping WS actions cannot corrupt shared state.
import { warnCaught } from "../lib/catch-log.js";

interface QueueEntry {
  tail: Promise<void>;
  pending: number;
}

const queueEntries = new Map<string, QueueEntry>();

const getQueueEntry = (key: string): QueueEntry => {
  const existingEntry = queueEntries.get(key);
  if (existingEntry) {
    return existingEntry;
  }

  const nextEntry: QueueEntry = {
    tail: Promise.resolve(),
    pending: 0,
  };
  queueEntries.set(key, nextEntry);
  return nextEntry;
};

const cleanupQueueEntry = (key: string, entry: QueueEntry): void => {
  entry.pending -= 1;
  if (entry.pending === 0) {
    queueEntries.delete(key);
  }
};

export const WORKSPACE_OPERATION_QUEUE_KEY = "workspace:create";

/** Serializes Metro singleton starts so two projects cannot race killAll/startExpo. */
export const METRO_OPERATION_QUEUE_KEY = "metro:singleton";

export const getProjectOperationQueueKey = (projectName: string): string =>
  `project:${projectName}`;

export const OPERATION_TIMEOUT_MS = 600_000; // 10 minutes default for iterate/revert/etc.

export interface EnqueueProjectOperationOptions {
  timeoutMs?: number;
}

export const enqueueProjectOperation = <T>(
  key: string,
  operationName: string,
  task: () => Promise<T>,
  options: EnqueueProjectOperationOptions = {},
): Promise<T> => {
  const timeoutMs = options.timeoutMs ?? OPERATION_TIMEOUT_MS;
  const entry = getQueueEntry(key);
  entry.pending += 1;

  const run = entry.tail
    .catch((error) => {
      warnCaught("project-operation-lock", error, `${operationName} queue tail rejected (${key})`);
    })
    .then(async () => {
      console.log(`[ProjectQueue] ${operationName} started (${key})`);
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      try {
        return await Promise.race([
          task(),
          new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
              reject(new Error(`Operation ${operationName} timed out after ${timeoutMs / 1000}s`));
            }, timeoutMs);
            timeoutId.unref();
          }),
        ]);
      } finally {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
        }
      }
    });

  entry.tail = run
    .then(() => undefined)
    .catch((error) => {
      warnCaught("project-operation-lock", error, `${operationName} queue run rejected (${key})`);
    })
    .finally(() => {
      console.log(`[ProjectQueue] ${operationName} finished (${key})`);
      cleanupQueueEntry(key, entry);
    });

  return run;
};

export const attachOperationToQueueKey = (
  key: string,
  operationName: string,
  operation: Promise<unknown>
): void => {
  const entry = getQueueEntry(key);
  entry.pending += 1;

  console.log(`[ProjectQueue] ${operationName} mirrored (${key})`);

  entry.tail = entry.tail
    .catch((error) => {
      warnCaught("project-operation-lock", error, `${operationName} mirror tail rejected (${key})`);
    })
    .then(() => operation)
    .then(() => undefined)
    .catch((error) => {
      warnCaught("project-operation-lock", error, `${operationName} mirror run rejected (${key})`);
    })
    .finally(() => {
      console.log(`[ProjectQueue] ${operationName} finished (${key})`);
      cleanupQueueEntry(key, entry);
    });
};

export const getPendingOperationCount = (key: string): number =>
  queueEntries.get(key)?.pending ?? 0;
