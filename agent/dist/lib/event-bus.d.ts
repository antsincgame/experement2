import type { NextFunction, Request, Response } from "express";
import { WebSocket } from "ws";
export interface EventScope {
    clientId?: string;
    projectName?: string;
    requestId?: string;
}
export declare const runWithEventScope: <T>(scope: EventScope, task: () => T) => T;
export declare const registerClient: (clientId: string, ws: WebSocket) => void;
export declare const unregisterClient: (clientId: string) => void;
export declare const broadcast: (message: Record<string, unknown>, scope?: EventScope) => void;
export declare const sendToClient: (clientId: string, message: Record<string, unknown>, scope?: EventScope) => void;
export declare const setPreviewPort: (projectName: string, port: number | null) => void;
export declare const getPreviewPort: (projectName: string) => number | null;
export declare const handlePreviewRequest: (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=event-bus.d.ts.map