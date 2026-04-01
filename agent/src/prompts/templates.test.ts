// Verifies that auto-generated layouts follow the shared navigation contract instead of hardcoded tabs.
import { describe, expect, it } from "vitest";
import { getRootLayout, getTabsLayout } from "./templates.js";

describe("templates", () => {
  it("creates a stack-based root layout for tabs", () => {
    const layout = getRootLayout({
      type: "tabs",
      screens: [{ path: "app/(tabs)/index.tsx", name: "Home", icon: "home-outline" }],
    });

    expect(layout).toContain('import { Stack } from "expo-router";');
    expect(layout).toContain("headerShown: false");
  });

  it("creates tabs from the navigation screens", () => {
    const tabsLayout = getTabsLayout({
      type: "tabs",
      screens: [
        { path: "app/(tabs)/index.tsx", name: "Home", icon: "home-outline" },
        { path: "app/(tabs)/settings.tsx", name: "Settings", icon: "settings-outline" },
      ],
    });

    expect(tabsLayout).toContain('name="index"');
    expect(tabsLayout).toContain('name="settings"');
    expect(tabsLayout).toContain('title: "Settings"');
  });
});
