import { z } from "zod";
export declare const FileInPlanSchema: z.ZodObject<{
    path: z.ZodString;
    type: z.ZodString;
    description: z.ZodString;
    dependencies: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    path: string;
    type: string;
    description: string;
    dependencies: string[];
}, {
    path: string;
    type: string;
    description: string;
    dependencies?: string[] | undefined;
}>;
export type FileInPlan = z.infer<typeof FileInPlanSchema>;
export declare const NavigationScreenSchema: z.ZodObject<{
    path: z.ZodString;
    name: z.ZodString;
    icon: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    path: string;
    icon?: string | undefined;
}, {
    name: string;
    path: string;
    icon?: string | undefined;
}>;
export declare const AppPlanSchema: z.ZodObject<{
    name: z.ZodEffects<z.ZodString, string, string>;
    displayName: z.ZodString;
    description: z.ZodString;
    files: z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        type: z.ZodString;
        description: z.ZodString;
        dependencies: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        path: string;
        type: string;
        description: string;
        dependencies: string[];
    }, {
        path: string;
        type: string;
        description: string;
        dependencies?: string[] | undefined;
    }>, "many">;
    extraDependencies: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    navigation: z.ZodOptional<z.ZodObject<{
        type: z.ZodDefault<z.ZodEnum<["stack", "tabs", "drawer"]>>;
        screens: z.ZodDefault<z.ZodArray<z.ZodObject<{
            path: z.ZodString;
            name: z.ZodString;
            icon: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            name: string;
            path: string;
            icon?: string | undefined;
        }, {
            name: string;
            path: string;
            icon?: string | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        type: "stack" | "tabs" | "drawer";
        screens: {
            name: string;
            path: string;
            icon?: string | undefined;
        }[];
    }, {
        type?: "stack" | "tabs" | "drawer" | undefined;
        screens?: {
            name: string;
            path: string;
            icon?: string | undefined;
        }[] | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    files: {
        path: string;
        type: string;
        description: string;
        dependencies: string[];
    }[];
    description: string;
    displayName: string;
    extraDependencies: string[];
    navigation?: {
        type: "stack" | "tabs" | "drawer";
        screens: {
            name: string;
            path: string;
            icon?: string | undefined;
        }[];
    } | undefined;
}, {
    name: string;
    files: {
        path: string;
        type: string;
        description: string;
        dependencies?: string[] | undefined;
    }[];
    description: string;
    displayName: string;
    extraDependencies?: string[] | undefined;
    navigation?: {
        type?: "stack" | "tabs" | "drawer" | undefined;
        screens?: {
            name: string;
            path: string;
            icon?: string | undefined;
        }[] | undefined;
    } | undefined;
}>;
export type AppPlan = z.infer<typeof AppPlanSchema>;
//# sourceMappingURL=app-plan.schema.d.ts.map