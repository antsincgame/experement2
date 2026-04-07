import { type EditAction } from "../schemas/edit-action.schema.js";
import type { SearchReplaceBlock } from "../schemas/search-replace.schema.js";
interface ChatMessage {
    role: "user" | "assistant";
    content: string;
}
interface EditorOptions {
    projectName: string;
    userRequest: string;
    chatHistory: ChatMessage[];
    lmStudioUrl?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    onThinking?: (text: string) => void;
    onBlock?: (block: SearchReplaceBlock) => void;
    onDiff?: (filepath: string, before: string, after: string) => void;
    onAnalysis?: (action: EditAction) => void;
}
interface EditorResult {
    action: EditAction;
    appliedBlocks: number;
    failedBlocks: number;
    errors: string[];
}
export declare const editProject: (options: EditorOptions) => Promise<EditorResult>;
export {};
//# sourceMappingURL=editor.d.ts.map