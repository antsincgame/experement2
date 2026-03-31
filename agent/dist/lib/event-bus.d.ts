import type { NextFunction, Request, Response } from "express";
import { WebSocket } from "ws";
export declare const registerClient: (clientId: string, ws: WebSocket) => void;
export declare const unregisterClient: (clientId: string) => void;
export declare const broadcast: (message: Record<string, unknown>) => void;
export declare const sendToClient: (clientId: string, message: Record<string, unknown>) => void;
export declare const handlePreviewRequest: (req: Request, res: Response, next: NextFunction) => void;
export declare const setPreviewPort: (port: number | null) => void;
//# sourceMappingURL=event-bus.d.ts.map