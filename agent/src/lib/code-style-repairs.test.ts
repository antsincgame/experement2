import { describe, it, expect } from "vitest";
import { applyDeterministicCodeRepairs } from "./code-style-repairs.js";

describe("applyDeterministicCodeRepairs", () => {
  it("fixes bg= inside Tamagui style object literals", () => {
    const broken = `pressStyle={{ scale: 0.95, bg="$gray2" }}`;
    const fixed = applyDeterministicCodeRepairs(broken);
    expect(fixed).toContain('bg: "$gray2"');
    expect(fixed).not.toMatch(/,\s*bg="/);
  });

  it("fixes Separator orientation prop", () => {
    const broken = `<Separator orientation="vertical" marginHorizontal="$1" />`;
    expect(applyDeterministicCodeRepairs(broken)).toBe(
      `<Separator vertical marginHorizontal="$1" />`,
    );
  });
});
