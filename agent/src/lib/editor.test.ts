import { describe, expect, it } from "vitest";
import { isUnsafeEditPath } from "./editor.js";

describe("isUnsafeEditPath", () => {
  it("allows normal project files and root config", () => {
    expect(isUnsafeEditPath("src/components/FilterSheet.tsx")).toBe(false);
    expect(isUnsafeEditPath("app/(tabs)/index.tsx")).toBe(false);
    expect(isUnsafeEditPath("package.json")).toBe(false);
    expect(isUnsafeEditPath("tamagui.config.ts")).toBe(false);
  });

  it("rejects absolute paths (windows and posix)", () => {
    expect(
      isUnsafeEditPath(
        "D:\\projects\\experement2\\workspace\\spendwise-tracker\\node_modules\\esbuild-register\\dist\\node.js"
      )
    ).toBe(true);
    expect(isUnsafeEditPath("/etc/passwd")).toBe(true);
  });

  it("rejects parent-traversal and dependency/build directories", () => {
    expect(isUnsafeEditPath("../secret.ts")).toBe(true);
    expect(isUnsafeEditPath("src/../../escape.ts")).toBe(true);
    expect(isUnsafeEditPath("node_modules/esbuild-register/dist/node.js")).toBe(true);
    expect(isUnsafeEditPath(".git/config")).toBe(true);
    expect(isUnsafeEditPath(".expo/types/router.d.ts")).toBe(true);
    expect(isUnsafeEditPath("dist/bundle.js")).toBe(true);
  });

  it("rejects empty or whitespace paths", () => {
    expect(isUnsafeEditPath("")).toBe(true);
    expect(isUnsafeEditPath("   ")).toBe(true);
  });
});
