import { type AppPlan } from "../schemas/app-plan.schema.js";
interface PlannerOptions {
    description: string;
    temperature?: number;
    maxTokens?: number;
    lmStudioUrl?: string;
    model?: string;
    onChunk?: (chunk: string) => void;
}
export declare const planApp: (options: PlannerOptions) => Promise<AppPlan>;
export {};
//# sourceMappingURL=planner.d.ts.map