import type { AppPlan } from "../schemas/app-plan.schema.js";
interface GeneratorOptions {
    projectName: string;
    projectPath: string;
    plan: AppPlan;
    lmStudioUrl?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    onFileStart?: (filepath: string, index: number, total: number) => void;
    onChunk?: (chunk: string) => void;
    onFileComplete?: (filepath: string) => void;
}
export declare const generateFiles: (options: GeneratorOptions) => Promise<string[]>;
export {};
//# sourceMappingURL=generator.d.ts.map