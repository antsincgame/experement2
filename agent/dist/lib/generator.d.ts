import { type ExportContract } from "./context-builder.js";
import type { AppPlan } from "../schemas/app-plan.schema.js";
import type { ContractViolation } from "./project-validator.js";
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
export declare const regenerateFileWithContracts: (projectName: string, _projectPath: string, filePath: string, violations: ContractViolation[], contracts: Record<string, ExportContract[]>, options?: {
    lmStudioUrl?: string;
    model?: string;
    maxTokens?: number;
}) => Promise<string | null>;
export {};
//# sourceMappingURL=generator.d.ts.map