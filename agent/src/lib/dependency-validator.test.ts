import { describe, it, expect } from "vitest";
import { pinExtraDependencyForSdk, validateDependencies } from "./dependency-validator.js";

// Known-safe names skip the registry, and malformed names are rejected before
// any network call — so these cases are deterministic and offline.
describe("validateDependencies", () => {
  it("accepts known-safe packages without a network call", async () => {
    const { valid, rejected } = await validateDependencies(["zustand", "react-native-svg"]);
    expect(valid).toContain("zustand");
    expect(valid).toContain("react-native-svg");
    expect(rejected).toHaveLength(0);
  });

  it("pins expo-contacts to SDK 55 when planner requests v56", async () => {
    const { valid } = await validateDependencies(["expo-contacts@^56.0.7"]);
    expect(valid).toContain("expo-contacts@~55.0.11");
  });

  it("pinExtraDependencyForSdk upgrades bare expo-haptics", () => {
    expect(pinExtraDependencyForSdk("expo-haptics")).toBe("expo-haptics@~55.0.11");
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

  it("rejects command-injection characters in the full dependency string", async () => {
    const { valid, rejected } = await validateDependencies([
      "foo@1.0.0;calc.exe",
      "bar && evil",
    ]);
    expect(valid).toHaveLength(0);
    expect(rejected).toEqual(expect.arrayContaining(["foo@1.0.0;calc.exe", "bar && evil"]));
  });
});
