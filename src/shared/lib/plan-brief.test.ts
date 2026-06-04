import { describe, expect, it } from "vitest";
import { formatPlanBrief } from "./plan-brief";

describe("formatPlanBrief", () => {
  it("renders screens and blueprint path without JSON", () => {
    const text = formatPlanBrief({
      displayName: "MatchMate",
      description: "A dating app for matching by interests.",
      navigation: { type: "tabs", screens: [{ name: "Home", path: "app/(tabs)/index.tsx" }] },
      theme: { style: "dark-fantasy" },
      files: [
        { path: "app/(tabs)/index.tsx", type: "screen", description: "Swipe home screen." },
        { path: "src/components/EmptyState.tsx", type: "component", description: "Empty list placeholder." },
      ],
      extraDependencies: ["zustand"],
    });

    expect(text).toContain("**MatchMate**");
    expect(text).toContain("**Screens**");
    expect(text).toContain("EmptyState");
    expect(text).toContain("blueprint.json");
    expect(text).not.toContain('"files":');
  });
});
