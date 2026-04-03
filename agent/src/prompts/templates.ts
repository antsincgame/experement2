// Generates navigation layouts from the shared contract so prompts and runtime scaffolding match.
import type { AppPlan } from "../schemas/app-plan.schema.js";
import {
  ICON_CONTRACT,
  type SupportedNavigationType,
} from "../lib/generation-contract.js";

const getScreenRouteName = (routePath: string): string => {
  const normalized = routePath.replace(/^app\//, "").replace(/\.(tsx|ts)$/, "");
  const segments = normalized.split("/");
  return segments[segments.length - 1] ?? "index";
};

const getScreenTitle = (screenName: string): string =>
  screenName.trim().length > 0 ? screenName.trim() : "Screen";

const getScreenIcon = (icon?: string): string => icon?.trim() || "circle";

export const getRootLayout = (
  navigation: AppPlan["navigation"]
): string => {
  const navType: SupportedNavigationType = navigation?.type ?? "stack";

  // Both tabs and stack use <Stack> as root — Expo Router auto-discovers (tabs) group
  return `import "../src/global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="${navType === "tabs" ? "dark" : "dark"}" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
`;
};

export const getTabsLayout = (navigation: AppPlan["navigation"]): string => {
  const screens = navigation?.screens ?? [];
  const tabsScreens = screens
    .map((screen) => {
      const routeName = getScreenRouteName(screen.path);
      const title = getScreenTitle(screen.name);
      const icon = getScreenIcon(screen.icon);
      return `      <Tabs.Screen
        name="${routeName}"
        options={{
          title: "${title}",
          tabBarIcon: ({ color, size }) => (
            <${ICON_CONTRACT.defaultImportName} name="${icon}" size={size} color={color} />
          ),
        }}
      />`;
    })
    .join("\n");

  return `import { Tabs } from "expo-router";
import ${ICON_CONTRACT.defaultImportName} from "${ICON_CONTRACT.defaultImportPath}";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
${tabsScreens}
    </Tabs>
  );
}
`;
};

/** Static boilerplate remains centralized in template-cache; this stays for prompt-side dynamic layouts only. */
export const BOILERPLATE_TEMPLATES: Record<string, string> = {};
