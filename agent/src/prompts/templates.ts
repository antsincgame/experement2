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
  // Both tabs and stack use <Stack> as root — Expo Router auto-discovers (tabs) group
  return `import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
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

/** Generates src/theme.ts from the plan's theme object so colors match the planner's design. */
export const getThemeFile = (planTheme: AppPlan["theme"]): string => {
  const t = planTheme;
  const isDark = t.isDark;
  return `// App theme — design tokens synced with the plan
export const colors = {
  background: "${t.background}",
  surface: "${t.surface}",
  primary: "${t.primary}",
  primaryLight: "${t.accent}",
  text: "${t.primaryText}",
  textSecondary: "${t.secondaryText}",
  textMuted: "${isDark ? "#6B7280" : "#94A3B8"}",
  border: "${isDark ? "#374151" : "#E2E8F0"}",
  success: "#10B981",
  warning: "#F59E0B",
  error: "#EF4444",
  card: "${t.surface}",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: ${t.cardRadius},
  full: 9999,
};

export const shadows = {
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: ${isDark ? 0.3 : 0.05},
    shadowRadius: 12,
    elevation: 2,
  },
};

export const typography = {
  title: { fontSize: 28, fontWeight: "700" as const, color: colors.text },
  subtitle: { fontSize: 16, fontWeight: "600" as const, color: colors.text },
  body: { fontSize: 14, color: colors.text },
  caption: { fontSize: 12, color: colors.textSecondary },
};

export const theme = { colors, spacing, borderRadius, shadows, typography, isDark: ${isDark} };
// EOF
`;
};

/** Static boilerplate — no longer includes theme.ts (generated dynamically from plan). */
export const BOILERPLATE_TEMPLATES: Record<string, string> = {};
