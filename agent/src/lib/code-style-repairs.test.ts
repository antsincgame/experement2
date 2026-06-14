import { describe, it, expect } from "vitest";
import {
  applyDeterministicCodeRepairs,
  stripSuppressionDirectives,
} from "./code-style-repairs.js";

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

describe("stripSuppressionDirectives", () => {
  it("removes a whole-line @ts-expect-error directive (the TS2578 preview killer)", () => {
    const code = [
      "const value = getValue();",
      "// @ts-expect-error legacy prop",
      "render(value);",
    ].join("\n");
    expect(stripSuppressionDirectives(code)).toBe(
      ["const value = getValue();", "render(value);"].join("\n"),
    );
  });

  it("removes a whole-line @ts-ignore directive", () => {
    const code = ["// @ts-ignore", "doThing();"].join("\n");
    expect(stripSuppressionDirectives(code)).toBe("doThing();");
  });

  it("strips a trailing inline directive but keeps the code", () => {
    const code = "const x = y as Foo; // @ts-ignore mismatch";
    expect(stripSuppressionDirectives(code)).toBe("const x = y as Foo;");
  });

  it("removes an indented block-comment directive line", () => {
    const code = ["  /* @ts-expect-error */", "  use(x);"].join("\n");
    expect(stripSuppressionDirectives(code)).toBe("  use(x);");
  });

  it("leaves ordinary code and unrelated comments untouched", () => {
    const code = ["// a normal comment", "const a = 1; // inline note"].join("\n");
    expect(stripSuppressionDirectives(code)).toBe(code);
  });
});
