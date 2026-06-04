// Runtime shim: load shared via .ts (tsx .js suffix can bind an empty graph); call-time wrappers.
import type { PlanBriefInput, PlanFileEntry } from "../../../src/shared/lib/plan-brief.js";

const shared = await import("../../../src/shared/lib/plan-brief.ts");

export type { PlanBriefInput, PlanFileEntry };

export const formatPlanBriefForModels = (p: PlanBriefInput): string =>
  shared.formatPlanBriefForModels(p);
export const formatPlanBriefForChat = (p: PlanBriefInput): string =>
  shared.formatPlanBriefForChat(p);
export const formatPlanBrief = (p: PlanBriefInput): string => shared.formatPlanBrief(p);
export const summarizePlanForChat = (p: PlanBriefInput): string =>
  shared.summarizePlanForChat(p);
