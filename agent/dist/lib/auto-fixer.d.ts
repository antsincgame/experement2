import type { SearchReplaceBlock } from "../schemas/search-replace.schema.js";
export interface MetroError {
    type: string;
    file: string;
    line: string;
    raw: string;
}
interface AutoFixOptions {
    projectName: string;
    error: MetroError;
    lmStudioUrl?: string;
    maxAttempts?: number;
    onAttempt?: (attempt: number, maxAttempts: number) => void;
    onFix?: (block: SearchReplaceBlock) => void;
}
interface AutoFixResult {
    success: boolean;
    attempts: number;
    lastError?: string;
}
export declare const autoFix: (options: AutoFixOptions) => Promise<AutoFixResult>;
export {};
//# sourceMappingURL=auto-fixer.d.ts.map