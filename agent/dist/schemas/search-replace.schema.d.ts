import { z } from "zod";
export declare const SearchReplaceBlockSchema: z.ZodObject<{
    filepath: z.ZodString;
    type: z.ZodEnum<["search_replace", "new_file", "delete"]>;
    search: z.ZodOptional<z.ZodString>;
    replace: z.ZodOptional<z.ZodString>;
    content: z.ZodOptional<z.ZodString>;
    thinking: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "delete" | "search_replace" | "new_file";
    filepath: string;
    search?: string | undefined;
    replace?: string | undefined;
    content?: string | undefined;
    thinking?: string | undefined;
}, {
    type: "delete" | "search_replace" | "new_file";
    filepath: string;
    search?: string | undefined;
    replace?: string | undefined;
    content?: string | undefined;
    thinking?: string | undefined;
}>;
export type SearchReplaceBlock = z.infer<typeof SearchReplaceBlockSchema>;
//# sourceMappingURL=search-replace.schema.d.ts.map