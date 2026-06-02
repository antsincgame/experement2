import { describe, it, expect } from "vitest";
import { getErrorHint } from "./auto-fixer.js";

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
