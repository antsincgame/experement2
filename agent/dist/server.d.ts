import { WebSocket } from "ws";
declare const wss: import("ws").Server<typeof WebSocket, typeof import("http").IncomingMessage>;
export declare const setPreviewPort: (port: number | null) => void;
declare const broadcast: (message: Record<string, unknown>) => void;
export { broadcast, wss };
//# sourceMappingURL=server.d.ts.map