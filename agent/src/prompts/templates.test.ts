// Verifies that auto-generated layouts follow the shared navigation contract instead of hardcoded tabs.
import { describe, expect, it } from "vitest";
import { getRootLayout, getTabsLayout } from "./templates.js";

describe("templates", () => {
  it("creates a slot-based root layout for tabs", () => {
    const layout = getRootLayout({
      type: "tabs",
      screens: [{ path: "app/(tabs)/index.tsx", name: "Home", icon: "home-outline" }],
    });

    expect(layout).toContain('import { Slot } from "expo-router";');
    expect(layout).not.toContain('import { Tabs } from "expo-router";');
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
