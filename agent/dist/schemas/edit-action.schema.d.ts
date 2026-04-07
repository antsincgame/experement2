import { z } from "zod";
export declare const EditActionSchema: z.ZodObject<{
    thinking: z.ZodString;
    action: z.ZodEnum<["read_files", "no_changes_needed", "install_package"]>;
    files: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    newFiles: z.ZodDefault<z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        description: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        path: string;
        description: string;
    }, {
        path: string;
        description: string;
    }>, "many">>;
    filesToDelete: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    newDependencies: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    files: string[];
    thinking: string;
    action: "read_files" | "no_changes_needed" | "install_package";
    newFiles: {
        path: string;
        description: string;
    }[];
    filesToDelete: string[];
    newDependencies: string[];
}, {
    thinking: string;
    action: "read_files" | "no_changes_needed" | "install_package";
    files?: string[] | undefined;
    newFiles?: {
        path: string;
        description: string;
    }[] | undefined;
    filesToDelete?: string[] | undefined;
    newDependencies?: string[] | undefined;
}>;
export type EditAction = z.infer<typeof EditActionSchema>;
//# sourceMappingURL=edit-action.schema.d.ts.map