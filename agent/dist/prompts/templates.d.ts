import type { AppPlan } from "../schemas/app-plan.schema.js";
export declare const getRootLayout: (navigation: AppPlan["navigation"]) => string;
export declare const getTabsLayout: (navigation: AppPlan["navigation"]) => string;
/** Static boilerplate remains centralized in template-cache; this stays for prompt-side dynamic layouts only. */
export declare const BOILERPLATE_TEMPLATES: Record<string, string>;
//# sourceMappingURL=templates.d.ts.map