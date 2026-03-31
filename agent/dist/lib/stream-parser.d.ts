import type { SearchReplaceBlock } from "../schemas/search-replace.schema.js";
export declare function parseStream(stream: AsyncGenerator<string>): AsyncGenerator<SearchReplaceBlock | {
    type: "thinking";
    content: string;
}>;
//# sourceMappingURL=stream-parser.d.ts.map