import type { AppPlan } from "../schemas/app-plan.schema.js";
interface CreateOptions {
    description: string;
    lmStudioUrl?: string;
}
interface CreateResult {
    projectName: string;
    port: number;
    plan: AppPlan;
}
interface IterateOptions {
    projectName: string;
    userRequest: string;
    chatHistory: Array<{
        role: "user" | "assistant";
        content: string;
    }>;
    lmStudioUrl?: string;
}
interface IterateResult {
    appliedBlocks: number;
    failedBlocks: number;
    errors: string[];
}
export declare const createProject: (options: CreateOptions) => Promise<CreateResult>;
export declare const iterateProject: (options: IterateOptions) => Promise<IterateResult>;
export declare const revertVersion: (projectName: string, commitHash: string, _lmStudioUrl?: string) => Promise<void>;
export {};
//# sourceMappingURL=pipeline.d.ts.map