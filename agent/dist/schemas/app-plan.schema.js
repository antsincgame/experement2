// Aligns the app plan schema with the shared generation contract to reject unsupported shapes early.
import { z } from "zod";
import { SUPPORTED_NAVIGATION_TYPES } from "../lib/generation-contract.js";
export const FileInPlanSchema = z.object({
    path: z.string().min(1),
    type: z.string().min(1),
    description: z.string().min(1),
    dependencies: z.array(z.string()).default([]),
});
export const NavigationScreenSchema = z.object({
    path: z.string().optional().default(""),
    name: z.string(),
    icon: z.string().optional(),
});
export const AppPlanSchema = z.object({
    name: z.string().min(1).transform((s) => s.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-")),
    displayName: z.string().min(1),
    description: z.string().min(1),
    files: z.array(FileInPlanSchema).min(1),
    extraDependencies: z.array(z.string()).default([]),
    navigation: z
        .object({
        type: z.enum(SUPPORTED_NAVIGATION_TYPES).default("stack"),
        screens: z.array(NavigationScreenSchema).default([]),
    })
        .optional(),
});
//# sourceMappingURL=app-plan.schema.js.map