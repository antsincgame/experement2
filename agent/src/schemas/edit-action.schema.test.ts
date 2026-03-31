import { describe, it, expect } from "vitest";
import { EditActionSchema } from "./edit-action.schema";

describe("EditActionSchema", () => {
  it("parses a valid read_files action", () => {
    const result = EditActionSchema.parse({
      thinking: "Need to read the main component",
      action: "read_files",
      files: ["src/App.tsx", "src/index.ts"],
    });
    expect(result.action).toBe("read_files");
    expect(result.files).toEqual(["src/App.tsx", "src/index.ts"]);
    expect(result.newFiles).toEqual([]);
    expect(result.filesToDelete).toEqual([]);
    expect(result.newDependencies).toEqual([]);
  });

  it("parses a valid no_changes_needed action", () => {
    const result = EditActionSchema.parse({
      thinking: "Everything looks correct",
      action: "no_changes_needed",
    });
    expect(result.action).toBe("no_changes_needed");
    expect(result.files).toEqual([]);
  });

  it("defaults files to empty array when omitted", () => {
    const result = EditActionSchema.parse({
      thinking: "Checking",
      action: "read_files",
    });
    expect(result.files).toEqual([]);
  });

  it("rejects invalid action type", () => {
    expect(() =>
      EditActionSchema.parse({
        thinking: "test",
        action: "delete_everything",
      })
    ).toThrow();
  });

  it("requires thinking field", () => {
    expect(() =>
      EditActionSchema.parse({
        action: "read_files",
        files: [],
      })
    ).toThrow();
  });

  it("parses newFiles and filesToDelete", () => {
    const result = EditActionSchema.parse({
      thinking: "Adding new component",
      action: "read_files",
      newFiles: [{ path: "src/Button.tsx", description: "Button component" }],
      filesToDelete: ["src/OldButton.tsx"],
      newDependencies: ["react-icons"],
    });
    expect(result.newFiles).toHaveLength(1);
    expect(result.newFiles[0].path).toBe("src/Button.tsx");
    expect(result.filesToDelete).toEqual(["src/OldButton.tsx"]);
    expect(result.newDependencies).toEqual(["react-icons"]);
  });

  it("strips extra fields from input", () => {
    const result = EditActionSchema.parse({
      thinking: "test",
      action: "read_files",
      unknownField: "should be stripped",
      anotherExtra: 42,
    });
    expect(result).not.toHaveProperty("unknownField");
    expect(result).not.toHaveProperty("anotherExtra");
  });

  it("accepts empty thinking string", () => {
    const result = EditActionSchema.parse({
      thinking: "",
      action: "read_files",
    });
    expect(result.thinking).toBe("");
  });
});
