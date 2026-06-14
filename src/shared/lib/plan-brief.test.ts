import { describe, expect, it } from "vitest";
import {
  formatPlanBriefForChat,
  formatPlanBriefForModels,
} from "./plan-brief";

const matchMatePlan = {
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
    const text = formatPlanBriefForModels(matchMatePlan);
    expect(text).toContain("# MatchMate");
    expect(text).toContain("Home swipe screen with ProfileCard");
    expect(text).toContain("Swipeable profile card");
    expect(text).toContain("blueprint.json");
    expect(text).not.toContain('"files":');
  });
});

describe("formatPlanBriefForChat", () => {
  it("stays scannable and references brief.md", () => {
    const text = formatPlanBriefForChat(matchMatePlan);
    expect(text).toContain("**Blueprint**");
    expect(text).toContain("blueprint-brief.md");
    expect(text.length).toBeLessThan(formatPlanBriefForModels(matchMatePlan).length);
  });
});

describe("formatPlanBriefForChat (brief render)", () => {
  it("renders screens and blueprint path without JSON", () => {
    const text = formatPlanBriefForChat({
      displayName: "MatchMate",
      description: "A dating app for matching by interests.",
      navigation: { type: "tabs", screens: [{ name: "Home", path: "app/(tabs)/index.tsx" }] },
      theme: { style: "dark-fantasy" },
      files: [
        { path: "app/(tabs)/index.tsx", type: "screen", description: "Swipe home screen." },
        {
          path: "src/components/EmptyState.tsx",
          type: "component",
          description: "Empty list placeholder.",
        },
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
