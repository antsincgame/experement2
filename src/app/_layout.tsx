import "@/global.css";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { useWebSocket } from "@/shared/hooks/use-websocket";
import { useKeyboardShortcuts } from "@/shared/hooks/use-keyboard-shortcuts";
import ErrorBoundary from "@/shared/components/error-boundary";

const AppShell = () => {
  useWebSocket();
  useKeyboardShortcuts();
  return null;
};

export default function RootLayout() {
  return (
    <ErrorBoundary fallbackLabel="App Factory crashed">
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
    </ErrorBoundary>
  );
}
