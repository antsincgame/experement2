// Generates navigation layouts from the shared contract so prompts and runtime scaffolding match.
import type { AppPlan } from "../schemas/app-plan.schema.js";
import {
  ICON_CONTRACT,
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
  _navigation: AppPlan["navigation"]
): string => {
  return `import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { TamaguiProvider, Theme } from "tamagui";
import config from "../tamagui.config";

export default function RootLayout() {
  return (
    <TamaguiProvider config={config}>
      <Theme name="light">
        <SafeAreaProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }} />
        </SafeAreaProvider>
      </Theme>
    </TamaguiProvider>
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

/** Static boilerplate — Tamagui handles theming via tamagui.config.ts. */
export const BOILERPLATE_TEMPLATES: Record<string, string> = {};
