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

const ALLOWED_ICONS = new Set([
  "home", "settings", "user", "search", "plus", "minus", "x", "check",
  "chevron-left", "chevron-right", "chevron-up", "chevron-down", "menu",
  "star", "heart", "clock", "calendar", "list", "edit", "trash-2", "save",
  "folder", "file-text", "image", "camera", "bell", "message-square", "mail",
  "phone", "map-pin", "link", "external-link", "share-2", "download", "upload",
  "cloud", "sun", "moon", "zap", "activity", "bar-chart-2", "pie-chart",
  "trending-up", "dollar-sign", "credit-card", "shopping-cart", "tag",
  "bookmark", "flag", "award", "gift", "music", "video", "play", "pause",
  "square", "circle", "info", "alert-circle", "eye", "lock", "unlock",
  "refresh-cw", "log-out", "globe", "hash", "grid", "layers", "filter",
  "sliders", "tool", "target", "compass", "package", "coffee", "droplet",
  "wind", "thermometer", "umbrella", "delete", "copy", "clipboard",
]);

const ICON_FALLBACKS: Record<string, string> = {
  "calculator": "hash", "palette": "droplet", "heart-outline": "heart",
  "home-outline": "home", "settings-outline": "settings", "trash-outline": "trash-2",
  "add": "plus", "remove": "minus", "close": "x", "done": "check",
  "money": "dollar-sign", "wallet": "credit-card", "clock-outline": "clock",
  "timer": "clock", "stopwatch": "clock", "fitness": "activity",
  "dumbbell": "activity", "weight": "activity", "water": "droplet",
  "food": "coffee", "restaurant": "coffee", "document": "file-text",
  "note": "file-text", "chart": "bar-chart-2", "graph": "trending-up",
  "analytics": "bar-chart-2", "notification": "bell", "alarm": "bell",
  "person": "user", "people": "user", "profile": "user", "account": "user",
  "category": "grid", "history": "clock", "refresh": "refresh-cw",
  "share": "share-2", "favorite": "star", "weather": "cloud",
  "temp": "thermometer", "temperature": "thermometer", "pill": "heart",
  "chef-hat": "coffee", "dice": "square", "leaf": "wind",
  "book": "file-text", "brain": "zap", "pen": "edit",
};

const getScreenIcon = (icon?: string): string => {
  const raw = icon?.trim() || "circle";
  if (ALLOWED_ICONS.has(raw)) return raw;
  return ICON_FALLBACKS[raw] ?? "circle";
};

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
