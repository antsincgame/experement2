import { describe, it, expect } from "vitest";
import { buildMetroConfig, NATIVE_MODULE_WEB_STUB } from "./template-cache.js";
import { WEB_INCOMPATIBLE_MODULES } from "../lib/generation-contract.js";

// Evaluate the generated CommonJS stub in-process and return its module.exports.
const loadStub = (): Record<string, unknown> => {
  const moduleObj: { exports: Record<string, unknown> } = { exports: {} };
  const run = new Function("module", "exports", NATIVE_MODULE_WEB_STUB) as unknown as (
    m: typeof moduleObj,
    e: typeof moduleObj.exports
  ) => void;
  run(moduleObj, moduleObj.exports);
  return moduleObj.exports;
};

describe("buildMetroConfig", () => {
  it("aliases every web-incompatible module to the stub on web only", () => {
    const cfg = buildMetroConfig();
    for (const mod of WEB_INCOMPATIBLE_MODULES) {
      expect(cfg).toContain(`"${mod}"`);
    }
    expect(cfg).toContain('platform === "web"');
    expect(cfg).toContain("web-stubs/native-module-stub.js");
    // Non-web (and non-stubbed) requests delegate to Metro's default resolver.
    expect(cfg).toContain("context.resolveRequest(context, moduleName, platform)");
  });
});

describe("NATIVE_MODULE_WEB_STUB", () => {
  it("loads without throwing and interops as an ES module", () => {
    const mod = loadStub() as Record<string, unknown>;
    expect(mod.__esModule).toBe(true);
    expect(mod.default).toBeDefined();
  });

  it("never crashes on enum/constant access (the UNDETERMINED load crash)", () => {
    const mod = loadStub() as Record<string, Record<string, unknown>>;
    // Uppercase namespaces (PermissionStatus, Accuracy, ...) read any constant as a string.
    expect(mod.PermissionStatus.UNDETERMINED).toBe("undetermined");
    expect(mod.Accuracy.High).toBe("undetermined");
  });

  it("treats async device calls as no-ops resolving to empty data", async () => {
    const mod = loadStub() as Record<string, () => Promise<{ data: unknown[] }>>;
    expect(typeof mod.getContactsAsync).toBe("function");
    const result = await mod.getContactsAsync();
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data).toHaveLength(0);
  });

  it("renders an uppercase export used as a component as nothing (null)", () => {
    const mod = loadStub() as Record<string, () => unknown>;
    // e.g. react-native-maps <Marker /> — calling the component yields null, not a crash.
    expect(mod.Marker()).toBeNull();
  });
});
