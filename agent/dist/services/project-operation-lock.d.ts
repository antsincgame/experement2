export declare const WORKSPACE_OPERATION_QUEUE_KEY = "workspace:create";
export declare const getProjectOperationQueueKey: (projectName: string) => string;
export declare const enqueueProjectOperation: <T>(key: string, operationName: string, task: () => Promise<T>) => Promise<T>;
export declare const attachOperationToQueueKey: (key: string, operationName: string, operation: Promise<unknown>) => void;
export declare const getPendingOperationCount: (key: string) => number;
//# sourceMappingURL=project-operation-lock.d.ts.map