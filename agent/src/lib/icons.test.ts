import { describe, it, expect } from "vitest";
import { resolveIconName, ICON_ALIASES, DEFAULT_ICON } from "./icons.js";

describe("resolveIconName", () => {
  it("maps known hallucinated aliases to real Feather glyphs", () => {
    expect(resolveIconName("calculator")).toBe("hash");
    expect(resolveIconName("palette")).toBe("droplet");
    expect(resolveIconName("home-outline")).toBe("home");
    expect(resolveIconName("settings-outline")).toBe("settings");
  });

  it("passes through unknown names unchanged (runtime wrapper guarantees safety)", () => {
    expect(resolveIconName("sparkles")).toBe("sparkles");
    expect(resolveIconName("bar-chart-2")).toBe("bar-chart-2");
  });

  it("falls back to the default glyph for empty / missing input", () => {
    expect(resolveIconName("")).toBe(DEFAULT_ICON);
    expect(resolveIconName("   ")).toBe(DEFAULT_ICON);
    expect(resolveIconName(undefined)).toBe(DEFAULT_ICON);
  });

  it("trims surrounding whitespace before resolving", () => {
    expect(resolveIconName("  calculator ")).toBe("hash");
  });

  it("has no alias chains: every target is itself a valid (non-alias) name", () => {
    for (const target of Object.values(ICON_ALIASES)) {
      expect(ICON_ALIASES[target]).toBeUndefined();
    }
  });
});
