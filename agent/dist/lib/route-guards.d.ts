import type { Request, Response } from "express";
export declare const DANGEROUS_ACTION_HEADER = "x-app-factory-confirm";
export declare const DELETE_WORKSPACE_CONFIRMATION = "delete-workspace";
export declare const KILL_PROCESS_CONFIRMATION = "kill-preview-process";
export declare const requireDangerousAction: (req: Request, res: Response, confirmationValue: string, actionLabel: string) => boolean;
//# sourceMappingURL=route-guards.d.ts.map