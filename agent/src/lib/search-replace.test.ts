// Covers shared search/replace behavior so editor and autofix stay aligned on fuzzy matches.
import { describe, expect, it } from "vitest";
import { applySearchReplace } from "./search-replace.js";

describe("applySearchReplace", () => {
  it("replaces an exact single match", () => {
    const { result, error } = applySearchReplace(
      "const value = 1;\n",
      "const value = 1;",
      "const value = 2;"
    );

    expect(error).toBeNull();
    expect(result).toBe("const value = 2;\n");
  });

  it("replaces fuzzy matches that only differ by whitespace", () => {
    const before = [
      "export function demo() {",
      "  const value = 1;",
      "  return value;",
      "}",
    ].join("\n");
    const search = [
      "export function demo() {",
      "\tconst value = 1;",
      "\treturn value;",
      "}",
    ].join("\n");
    const replace = [
      "export function demo() {",
      "\tconst value = 2;",
      "\treturn value;",
      "}",
    ].join("\n");

    const { result, error } = applySearchReplace(before, search, replace);

    expect(error).toBeNull();
    expect(result).toContain("const value = 2;");
  });

  it("replaces first occurrence when multiple exact matches exist", () => {
    const { result, error } = applySearchReplace(
      "const value = 1;\nconst value = 1;\n",
      "const value = 1;",
      "const value = 2;"
    );

    expect(error).toBeNull();
    expect(result).toBe("const value = 2;\nconst value = 1;\n");
  });
});
