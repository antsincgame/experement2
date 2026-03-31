import { describe, it, expect } from "vitest";
import { SearchReplaceBlockSchema } from "./search-replace.schema";

describe("SearchReplaceBlockSchema", () => {
  it("parses a valid search_replace block", () => {
    const result = SearchReplaceBlockSchema.parse({
      filepath: "src/App.tsx",
      type: "search_replace",
      search: "const x = 1;",
      replace: "const x = 2;",
    });
    expect(result.type).toBe("search_replace");
    expect(result.search).toBe("const x = 1;");
    expect(result.replace).toBe("const x = 2;");
  });

  it("parses a valid new_file block with content", () => {
    const result = SearchReplaceBlockSchema.parse({
      filepath: "src/utils/format.ts",
      type: "new_file",
      content: "export const format = (s: string) => s.trim();",
    });
    expect(result.type).toBe("new_file");
    expect(result.content).toBe("export const format = (s: string) => s.trim();");
  });

  it("parses a delete block", () => {
    const result = SearchReplaceBlockSchema.parse({
      filepath: "src/old-module.ts",
      type: "delete",
    });
    expect(result.type).toBe("delete");
    expect(result.search).toBeUndefined();
    expect(result.replace).toBeUndefined();
    expect(result.content).toBeUndefined();
  });

  it("allows empty search string", () => {
    const result = SearchReplaceBlockSchema.parse({
      filepath: "src/App.tsx",
      type: "search_replace",
      search: "",
      replace: "// new content",
    });
    expect(result.search).toBe("");
  });

  it("rejects empty filepath", () => {
    expect(() =>
      SearchReplaceBlockSchema.parse({
        filepath: "",
        type: "search_replace",
        search: "a",
        replace: "b",
      })
    ).toThrow();
  });

  it("rejects invalid type value", () => {
    expect(() =>
      SearchReplaceBlockSchema.parse({
        filepath: "src/App.tsx",
        type: "rename",
      })
    ).toThrow();
  });

  it("rejects missing filepath", () => {
    expect(() =>
      SearchReplaceBlockSchema.parse({
        type: "new_file",
        content: "hello",
      })
    ).toThrow();
  });

  it("accepts optional thinking field", () => {
    const result = SearchReplaceBlockSchema.parse({
      filepath: "src/App.tsx",
      type: "search_replace",
      search: "old",
      replace: "new",
      thinking: "Renaming variable for clarity",
    });
    expect(result.thinking).toBe("Renaming variable for clarity");
  });

  it("allows search_replace without search/replace (both optional)", () => {
    const result = SearchReplaceBlockSchema.parse({
      filepath: "src/App.tsx",
      type: "search_replace",
    });
    expect(result.search).toBeUndefined();
    expect(result.replace).toBeUndefined();
  });
});
