import { z } from "zod";

export const FileInPlanSchema = z.object({
  path: z.string().min(1),
  type: z.string().min(1),
  description: z.string().min(1),
  dependencies: z.array(z.string()).default([]),
});

export type FileInPlan = z.infer<typeof FileInPlanSchema>;

export const NavigationScreenSchema = z.object({
  path: z.string(),
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
      type: z.enum(["stack", "tabs", "drawer"]).default("stack"),
      screens: z.array(NavigationScreenSchema).default([]),
    })
    .optional(),
});

export type AppPlan = z.infer<typeof AppPlanSchema>;
