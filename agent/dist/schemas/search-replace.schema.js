import { z } from "zod";
export const SearchReplaceBlockSchema = z.object({
    filepath: z.string().min(1),
    type: z.enum(["search_replace", "new_file", "delete"]),
    search: z.string().optional(),
    replace: z.string().optional(),
    content: z.string().optional(),
    thinking: z.string().optional(),
});
//# sourceMappingURL=search-replace.schema.js.map