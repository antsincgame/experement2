import type { AppPlan } from "../schemas/app-plan.schema.js";
import { type SupportedNavigationType } from "./generation-contract.js";
export interface ValidationIssue {
    code: string;
    message: string;
    filePath?: string;
}
export declare const validateAppPlan: (plan: AppPlan) => ValidationIssue[];
export declare const validateGeneratedProject: (projectPath: string, navigationType?: SupportedNavigationType) => ValidationIssue[];
//# sourceMappingURL=project-validator.d.ts.map