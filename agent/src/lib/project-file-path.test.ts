import { describe, it, expect } from "vitest";
import { toEditableProjectPath } from "./project-file-path.js";

describe("toEditableProjectPath", () => {
  it("extracts src path from Metro absolute Windows path", () => {
    expect(
      toEditableProjectPath(
        "D:/projects/experement2/workspace/markdown-notes/src/components/Toolbar.tsx",
      ),
    ).toBe("src/components/Toolbar.tsx");
  });

  it("returns relative paths unchanged", () => {
    expect(toEditableProjectPath("app/(tabs)/index.tsx")).toBe("app/(tabs)/index.tsx");
  });
});
