import { describe, expect, it } from "vitest";
import type { AppPlan } from "../schemas/app-plan.schema.js";
import { formatPlanBriefForChat, formatPlanBriefForModels } from "./plan-brief.js";

const minimalPlan: AppPlan = {
  name: "matchmate",
  displayName: "MatchMate",
  description: "Dating app matching by interests and location with swipe UX.",
  files: [
    {
      path: "app/(tabs)/index.tsx",
      type: "screen",
      description: "Home swipe screen with ProfileCard stack and EmptyState when empty.",
      dependencies: ["src/components/ProfileCard.tsx"],
    },
    {
      path: "src/components/ProfileCard.tsx",
      type: "component",
      description: "Swipeable profile card with enterStyle animations.",
      dependencies: ["src/types/index.ts"],
    },
  ],
  extraDependencies: ["zustand"],
  theme: {
    style: "dark-fantasy",
    background: "#1A1A1D",
    surface: "#2D2D30",
    primary: "#C9A84C",
    primaryText: "#E8D5B5",
    secondaryText: "#8B8B8B",
    accent: "#FF2D55",
    cardRadius: 20,
    buttonRadius: 28,
    isDark: true,
  },
  navigation: {
    type: "tabs",
    screens: [{ path: "app/(tabs)/index.tsx", name: "Home", icon: "heart" }],
  },
};

describe("formatPlanBriefForModels", () => {
  it("includes full screen spec and points to json for graph", () => {
    const text = formatPlanBriefForModels(minimalPlan);
    expect(text).toContain("# MatchMate");
    expect(text).toContain("Home swipe screen with ProfileCard");
    expect(text).toContain("Swipeable profile card");
    expect(text).toContain("blueprint.json");
    expect(text).not.toContain('"files":');
  });
});

describe("formatPlanBriefForChat", () => {
  it("stays scannable and references brief.md", () => {
    const text = formatPlanBriefForChat(minimalPlan);
    expect(text).toContain("**Blueprint**");
    expect(text).toContain("blueprint-brief.md");
    expect(text.length).toBeLessThan(formatPlanBriefForModels(minimalPlan).length);
  });
});
