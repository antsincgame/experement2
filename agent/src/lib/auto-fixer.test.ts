import { describe, it, expect } from "vitest";
import { autoFix, getErrorHint, type MetroError } from "./auto-fixer.js";
import type { CompleteFn } from "../services/llm-proxy.js";
import { streamOf } from "../test-support/llm-mock.js";
import { writeFile } from "../services/file-manager.js";
import { makeTempProjectName, removeTempProject } from "../test-support/temp-workspace.js";

const searchReplace = (filepath: string, search: string, replace: string): string =>
  ["filepath: " + filepath, "<<<<<<< SEARCH", search, "=======", replace, ">>>>>>> REPLACE"].join("\n");

describe("autoFix (safety guards)", () => {
  it("skips non-actionable errors (file 'unknown') without calling the model", async () => {
    let called = false;
    const complete: CompleteFn = async () => {
      called = true;
      return streamOf("");
    };

    const error: MetroError = {
      type: "UnknownError",
      file: "unknown",
      line: "0",
      raw: "Metro build timed out after 60000ms",
    };

    const result = await autoFix({ projectName: "vitest-noop", error, complete });

    expect(called).toBe(false);
    expect(result.success).toBe(false);
    expect(result.attempts).toBe(0);
    expect(result.lastError).toContain("no editable source file");
  });

  it("bails on a node_modules crash with a clear web-incompatible reason (no model call)", async () => {
    let called = false;
    const complete: CompleteFn = async () => {
      called = true;
      return streamOf("");
    };

    // A native-only module crashes the Expo web bundle from inside node_modules
    // (e.g. expo-contacts reading PermissionStatus.UNDETERMINED). Autofix cannot edit
    // node_modules, so it must bail instantly with a named, actionable reason.
    const error: MetroError = {
      type: "TypeError",
      file: "node_modules/expo-contacts/src/ExpoContactsNext.web.ts",
      line: "8",
      raw: "TypeError: Cannot read properties of undefined (reading 'UNDETERMINED')",
    };

    const result = await autoFix({ projectName: "vitest-nm", error, complete });

    expect(called).toBe(false);
    expect(result.success).toBe(false);
    expect(result.attempts).toBe(0);
    expect(result.lastError).toContain("not web-compatible");
    expect(result.lastError).toContain("expo-contacts");
  });

  it("never throws when the model echoes an absolute/node_modules path", async () => {
    const projectName = makeTempProjectName("autofix-unsafe");
    writeFile(projectName, "app/index.tsx", "export const x = 1;\n");

    // The model returns a block targeting an absolute esbuild-register path
    // (as observed when a weak model echoes the Metro stack trace).
    const complete: CompleteFn = async () =>
      streamOf(
        searchReplace(
          "D:\\projects\\experement2\\workspace\\x\\node_modules\\esbuild-register\\dist\\node.js",
          "a",
          "b"
        )
      );

    const error: MetroError = {
      type: "SyntaxError",
      file: "app/index.tsx",
      line: "1",
      raw: "app/index.tsx(1,1): SyntaxError: boom",
    };

    try {
      const result = await autoFix({ projectName, error, complete, maxAttempts: 1 });
      expect(result.success).toBe(false);
    } finally {
      removeTempProject(projectName);
    }
  });
});

describe("getErrorHint", () => {
  it("points icon TS2322 errors in _layout to the <Icon> kit wrapper", () => {
    const raw = `app/_layout.tsx(12,3): error TS2322: Type '"foo"' is not assignable to type 'IconName'`;
    const hint = getErrorHint(raw);
    expect(hint).toContain("@/ui");
    expect(hint).toContain("Icon");
  });

  it("gives a generic prop-type hint for other TS2322 errors", () => {
    const raw = "src/Card.tsx(1,1): error TS2322: Type 'number' is not assignable to type 'string'";
    expect(getErrorHint(raw)).toContain("does not match the expected type");
  });

  it("suggests a missing import for TS2304 / TS2552", () => {
    expect(getErrorHint("error TS2304: Cannot find name 'View'")).toContain("missing import");
    expect(getErrorHint("error TS2552: Cannot find name 'Tex'")).toContain("missing import");
  });

  it("explains tamagui re-exports for TS2305", () => {
    const hint = getErrorHint("error TS2305: Module 'tamagui' has no exported member 'Pressable'");
    expect(hint).toContain("react-native");
  });

  it("returns an empty string when no specific hint applies", () => {
    expect(getErrorHint("error TS1005: ';' expected")).toBe("");
  });
});
