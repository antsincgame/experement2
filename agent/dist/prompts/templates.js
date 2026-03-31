import { ICON_CONTRACT, } from "../lib/generation-contract.js";
const getScreenRouteName = (routePath) => {
    const normalized = routePath.replace(/^app\//, "").replace(/\.(tsx|ts)$/, "");
    const segments = normalized.split("/");
    return segments[segments.length - 1] ?? "index";
};
const getScreenTitle = (screenName) => screenName.trim().length > 0 ? screenName.trim() : "Screen";
const getScreenIcon = (icon) => icon?.trim() || "ellipse-outline";
export const getRootLayout = (navigation) => {
    const navType = navigation?.type ?? "stack";
    if (navType === "tabs") {
        return `import "../src/global.css";
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Slot />
    </>
  );
}
`;
    }
    return `import "../src/global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#FAFAFA" },
        }}
      />
    </>
  );
}
`;
};
export const getTabsLayout = (navigation) => {
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
export const BOILERPLATE_TEMPLATES = {};
//# sourceMappingURL=templates.js.map