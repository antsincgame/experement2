import type { Request, Response as ExpressResponse } from "express";
export declare const clearModelCache: (baseUrl?: string) => void;
interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}
export declare const streamCompletion: (messages: ChatMessage[], options?: {
    temperature?: number;
    maxTokens?: number;
    responseFormat?: {
        type: "json_object";
    };
    model?: string;
    lmStudioUrl?: string;
    taskId?: string;
}) => Promise<AsyncGenerator<string>>;
export declare const completeNonStreaming: (messages: ChatMessage[], options?: {
    temperature?: number;
    maxTokens?: number;
    responseFormat?: {
        type: "json_object";
    };
    model?: string;
    lmStudioUrl?: string;
}) => Promise<string>;
export declare const getActiveRequestCount: () => number;
export declare const abortTask: (taskId: string) => boolean;
export declare const abortAll: () => number;
export declare const handleLLMProxyRoute: (req: Request, res: ExpressResponse) => Promise<void>;
export {};
//# sourceMappingURL=llm-proxy.d.ts.map