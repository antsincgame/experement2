export const BOILERPLATE_TEMPLATES = {
    "app/_layout.tsx": `import "../src/global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0a0a0f" } }} />
    </>
  );
}
`,
};
//# sourceMappingURL=templates.js.map