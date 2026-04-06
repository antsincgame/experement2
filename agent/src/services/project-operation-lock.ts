// Serializes heavy project operations so overlapping WS actions cannot corrupt shared state.
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

export const getProjectOperationQueueKey = (projectName: string): string =>
  `project:${projectName}`;

const OPERATION_TIMEOUT_MS = 600_000; // 10 minutes max per operation

export const enqueueProjectOperation = <T>(
  key: string,
  operationName: string,
  task: () => Promise<T>
): Promise<T> => {
  const entry = getQueueEntry(key);
  entry.pending += 1;

  const run = entry.tail
    .catch(() => undefined)
    .then(async () => {
      console.log(`[ProjectQueue] ${operationName} started (${key})`);
      return Promise.race([
        task(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Operation ${operationName} timed out after ${OPERATION_TIMEOUT_MS / 1000}s`)), OPERATION_TIMEOUT_MS)
        ),
      ]);
    });

  entry.tail = run
    .then(() => undefined)
    .catch(() => undefined)
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
    .catch(() => undefined)
    .then(() => operation)
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      console.log(`[ProjectQueue] ${operationName} finished (${key})`);
      cleanupQueueEntry(key, entry);
    });
};

export const getPendingOperationCount = (key: string): number =>
  queueEntries.get(key)?.pending ?? 0;
