import { describe, expect, it } from "vitest";
import { getEditorContent, isFileDirty } from "./file-editor";

describe("file-editor helpers", () => {
  it("returns draft when present", () => {
    expect(
      getEditorContent({ "a.ts": "saved" }, { "a.ts": "draft" }, "a.ts")
    ).toBe("draft");
  });

  it("detects dirty drafts", () => {
    expect(isFileDirty({ "a.ts": "saved" }, { "a.ts": "changed" }, "a.ts")).toBe(true);
    expect(isFileDirty({ "a.ts": "same" }, { "a.ts": "same" }, "a.ts")).toBe(false);
    expect(isFileDirty({ "a.ts": "saved" }, {}, "a.ts")).toBe(false);
  });
});
