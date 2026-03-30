import "@/global.css";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { useWebSocket } from "@/shared/hooks/use-websocket";
import { useKeyboardShortcuts } from "@/shared/hooks/use-keyboard-shortcuts";

const AppShell = () => {
  useWebSocket();
  useKeyboardShortcuts();
  return null;
};

export default function RootLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: "#F0F0FF" }}>
      <StatusBar style="dark" />
      <AppShell />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "transparent" },
          animation: "fade",
        }}
      />
    </View>
  );
}
