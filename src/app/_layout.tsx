import "@/global.css";

import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { LogBox, View } from "react-native";
import { disposeWebSocketRuntime, useWebSocket } from "@/shared/hooks/use-websocket";
import { useKeyboardShortcuts } from "@/shared/hooks/use-keyboard-shortcuts";
import ErrorBoundary from "@/shared/components/error-boundary";

LogBox.ignoreLogs(["Failed to fetch", "Network request failed", "signal is aborted"]);

const AppShell = () => {
  useWebSocket();
  useKeyboardShortcuts();

  useEffect(() => () => {
    disposeWebSocketRuntime();
  }, []);

  return null;
};

export default function RootLayout() {
  return (
    <ErrorBoundary fallbackLabel="App Factory crashed">
      <View style={{ flex: 1, backgroundColor: "#0A0A0A" }}>
        <StatusBar style="light" />
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
