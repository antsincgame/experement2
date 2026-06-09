// Generates navigation layouts from the shared contract so prompts and runtime scaffolding match.
import type { AppPlan } from "../schemas/app-plan.schema.js";
import { resolveIconName } from "../lib/icons.js";

const getScreenRouteName = (routePath: string): string => {
  const normalized = routePath.replace(/^app\//, "").replace(/\.(tsx|ts)$/, "");
  const segments = normalized.split("/");
  return segments[segments.length - 1] ?? "index";
};

const getScreenTitle = (screenName: string): string =>
  screenName.trim().length > 0 ? screenName.trim() : "Screen";

/** Turns a screen file path into the URL expo-router serves it at. */
const getRouteHref = (routePath: string): string => {
  const normalized = routePath
    .replace(/^app\//, "")
    .replace(/\.(tsx|ts|jsx|js)$/, "")
    // Route groups like "(tabs)/" are transparent in the URL.
    .replace(/\([^/]+\)\//g, "")
    .replace(/(?:^|\/)index$/, "");
  return normalized.length > 0 ? `/${normalized}` : "/";
};

/**
 * Index route that redirects to the first screen. Generated only when a plan has
 * no root route of its own (no app/index.tsx and no app/(tabs)/index.tsx): expo
 * web then 404s on "/", which the agent's health check reads as a dead Metro and
 * which leaves the preview iframe blank. A deterministic redirect guarantees that
 * "/" always resolves to a real screen.
 */
export const getIndexRedirect = (navigation: AppPlan["navigation"]): string => {
  const firstScreen = navigation?.screens?.[0]?.path ?? "";
  const href = getRouteHref(firstScreen);
  return `import { Redirect } from "expo-router";

export default function Index() {
  return <Redirect href="${href}" />;
}
`;
};

export const getRootLayout = (
  _navigation: AppPlan["navigation"],
  theme?: Partial<AppPlan["theme"]>,
): string => {
  const isDark = theme?.isDark ?? false;
  const themeName = isDark ? "dark" : "light";
  const statusBarStyle = isDark ? "light" : "dark";
  return `import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { TamaguiProvider, Theme } from "tamagui";
import config from "../tamagui.config";

export default function RootLayout() {
  return (
    <TamaguiProvider config={config}>
      <Theme name="${themeName}">
        <SafeAreaProvider>
          <StatusBar style="${statusBarStyle}" />
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
      const icon = resolveIconName(screen.icon);
      return `      <Tabs.Screen
        name="${routeName}"
        options={{
          title: "${title}",
          tabBarIcon: ({ color, size }) => (
            <Icon name="${icon}" size={size} color={color} />
          ),
        }}
      />`;
    })
    .join("\n");

  return `import { Tabs } from "expo-router";
import { Icon } from "@/ui";

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
