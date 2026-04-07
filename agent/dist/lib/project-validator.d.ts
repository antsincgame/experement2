import type { AppPlan } from "../schemas/app-plan.schema.js";
import { type SupportedNavigationType } from "./generation-contract.js";
import { type ExportContract } from "./context-builder.js";
export interface ValidationIssue {
    code: string;
    message: string;
    filePath?: string;
}
export declare const validateAppPlan: (plan: AppPlan) => ValidationIssue[];
export declare const validateGeneratedProject: (projectPath: string, navigationType?: SupportedNavigationType) => ValidationIssue[];
export interface ContractViolation {
    filePath: string;
    dependencyPath: string;
    code: "default_import_mismatch" | "named_import_mismatch" | "invalid_destructured_key";
    message: string;
    expected: string;
    actual: string;
}
/**
 * Auto-heal import mismatches by rewriting the file on disk.
 * Returns the healed content (or original if nothing changed).
 */
export declare const autoHealImportContracts: (fileContent: string, contracts: Record<string, ExportContract[]>) => string;
/** Validate that generated files respect export contracts of their dependencies */
export declare const validateFileContracts: (fileContent: string, filePath: string, contracts: Record<string, ExportContract[]>) => ContractViolation[];
//# sourceMappingURL=project-validator.d.ts.map