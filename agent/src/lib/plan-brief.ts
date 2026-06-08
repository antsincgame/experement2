// Runtime shim: a DYNAMIC import (resolved at call time, after the graph loads) avoids
// the empty-graph/undefined-snapshot trap that an eager cross-package import hits under
// tsx; the call-time wrappers below keep the exports live. The ".js" specifier resolves
// to the .ts source under tsx AND lets `tsc -p tsconfig.build.json` emit a runnable dist
// (a ".ts" extension is a hard TS5097 build error).
import type { PlanBriefInput, PlanFileEntry } from "../../../src/shared/lib/plan-brief.js";

const shared = await import("../../../src/shared/lib/plan-brief.js");

export type { PlanBriefInput, PlanFileEntry };

export const formatPlanBriefForModels = (p: PlanBriefInput): string =>
  shared.formatPlanBriefForModels(p);
export const formatPlanBriefForChat = (p: PlanBriefInput): string =>
  shared.formatPlanBriefForChat(p);
export const formatPlanBrief = (p: PlanBriefInput): string => shared.formatPlanBrief(p);
export const summarizePlanForChat = (p: PlanBriefInput): string =>
  shared.summarizePlanForChat(p);
