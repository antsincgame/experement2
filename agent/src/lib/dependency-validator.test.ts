import { describe, it, expect } from "vitest";
import { validateDependencies } from "./dependency-validator.js";

// Known-safe names skip the registry, and malformed names are rejected before
// any network call — so these cases are deterministic and offline.
describe("validateDependencies", () => {
  it("accepts known-safe packages without a network call", async () => {
    const { valid, rejected } = await validateDependencies(["zustand", "react-native-svg"]);
    expect(valid).toContain("zustand");
    expect(valid).toContain("react-native-svg");
    expect(rejected).toHaveLength(0);
  });

  it("rejects npm CLI flags and path-like names before touching the registry", async () => {
    const inputs = ["--save-dev", "--registry=http://evil", "../evil", "foo bar"];
    const { valid, rejected } = await validateDependencies(inputs);
    expect(valid).toHaveLength(0);
    expect(rejected).toEqual(expect.arrayContaining(inputs));
  });

  it("validates the bare name but preserves the original version spec", async () => {
    const { valid } = await validateDependencies(["zustand@^4.5.0"]);
    expect(valid).toContain("zustand@^4.5.0");
  });
});
