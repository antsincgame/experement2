// Runtime shim: call-time access (eager snapshot of cross-pkg const exports is undefined under tsx).
import * as shared from "../../../src/shared/lib/plan-brief.js";

export type { PlanBriefInput, PlanFileEntry } from "../../../src/shared/lib/plan-brief.js";

export const formatPlanBriefForModels = (p: shared.PlanBriefInput): string =>
  shared.formatPlanBriefForModels(p);
export const formatPlanBriefForChat = (p: shared.PlanBriefInput): string =>
  shared.formatPlanBriefForChat(p);
export const formatPlanBrief = (p: shared.PlanBriefInput): string => shared.formatPlanBrief(p);
export const summarizePlanForChat = (p: shared.PlanBriefInput): string =>
  shared.summarizePlanForChat(p);
export { PLAN_DRAFTING_PLACEHOLDER } from "../../../src/shared/lib/plan-brief.js";
