// Verifies that auto-generated layouts follow the shared navigation contract instead of hardcoded tabs.
import { describe, expect, it } from "vitest";
import { getIndexRedirect, getRootLayout, getTabsLayout } from "./templates.js";

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

describe("getIndexRedirect", () => {
  it("redirects to the first screen route", () => {
    const index = getIndexRedirect({
      type: "stack",
      screens: [
        { path: "app/login.tsx", name: "Login", icon: "log-in" },
        { path: "app/ride.tsx", name: "Ride", icon: "navigation" },
      ],
    });

    expect(index).toContain('import { Redirect } from "expo-router";');
    expect(index).toContain('href="/login"');
  });

  it("strips route groups from the href", () => {
    const index = getIndexRedirect({
      type: "tabs",
      screens: [{ path: "app/(tabs)/home.tsx", name: "Home", icon: "home" }],
    });

    expect(index).toContain('href="/home"');
  });

  it("falls back to the root route when no screens are planned", () => {
    const index = getIndexRedirect({ type: "stack", screens: [] });

    expect(index).toContain('href="/"');
  });
});
