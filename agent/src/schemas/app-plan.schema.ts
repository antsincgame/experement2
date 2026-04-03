// Aligns the app plan schema with the shared generation contract to reject unsupported shapes early.
import { z } from "zod";
import { SUPPORTED_NAVIGATION_TYPES } from "../lib/generation-contract.js";

export const FileInPlanSchema = z.object({
  path: z.string().min(1),
  type: z.string().min(1),
  description: z.string().min(1),
  dependencies: z.array(z.string()).default([]),
});

export type FileInPlan = z.infer<typeof FileInPlanSchema>;

export const NavigationScreenSchema = z.object({
  path: z.string().min(1),
  name: z.string().min(1),
  icon: z.string().optional(),
});

export const ThemeSchema = z.object({
  style: z.string().default("premium"),
  background: z.string().default("#F8FAFC"),
  surface: z.string().default("#FFFFFF"),
  primary: z.string().default("#6366F1"),
  primaryText: z.string().default("#0F172A"),
  secondaryText: z.string().default("#64748B"),
  accent: z.string().default("#6366F1"),
  cardRadius: z.number().default(20),
  buttonRadius: z.number().default(28),
  isDark: z.boolean().default(false),
}).default({});

export const AppPlanSchema = z.object({
  name: z.string().min(1).transform((s) => s.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-")),
  displayName: z.string().min(1),
  description: z.string().min(1),
  files: z.array(FileInPlanSchema).min(1),
  extraDependencies: z.array(z.string()).default([]),
  theme: ThemeSchema,
  navigation: z
    .object({
      type: z.enum(SUPPORTED_NAVIGATION_TYPES).default("stack"),
      screens: z.array(NavigationScreenSchema).default([]),
    })
    .optional(),
});

export type AppPlan = z.infer<typeof AppPlanSchema>;
