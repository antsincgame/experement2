const queueEntries = new Map();
const getQueueEntry = (key) => {
    const existingEntry = queueEntries.get(key);
    if (existingEntry) {
        return existingEntry;
    }
    const nextEntry = {
        tail: Promise.resolve(),
        pending: 0,
    };
    queueEntries.set(key, nextEntry);
    return nextEntry;
};
const cleanupQueueEntry = (key, entry) => {
    entry.pending -= 1;
    if (entry.pending === 0) {
        queueEntries.delete(key);
    }
};
export const WORKSPACE_OPERATION_QUEUE_KEY = "workspace:create";
export const getProjectOperationQueueKey = (projectName) => `project:${projectName}`;
export const enqueueProjectOperation = (key, operationName, task) => {
    const entry = getQueueEntry(key);
    entry.pending += 1;
    const run = entry.tail
        .catch(() => undefined)
        .then(async () => {
        console.log(`[ProjectQueue] ${operationName} started (${key})`);
        return task();
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
export const attachOperationToQueueKey = (key, operationName, operation) => {
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
export const getPendingOperationCount = (key) => queueEntries.get(key)?.pending ?? 0;
//# sourceMappingURL=project-operation-lock.js.map