import { Component, type ErrorInfo, type ReactNode } from "react";
import { View, Text, Pressable } from "react-native";
import { useSettingsStore } from "@/stores/settings-store";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackLabel?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    useSettingsStore.getState().addErrorLog({
      level: "error",
      source: "error-boundary",
      message: error.message,
      details: errorInfo.componentStack?.slice(0, 500),
    });
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <View className="flex-1 items-center justify-center p-6" style={{ backgroundColor: "rgba(255,51,102,0.03)" }}>
        <Text style={{ color: "#FF3366", fontSize: 14, fontWeight: "700", marginBottom: 8 }}>
          {this.props.fallbackLabel ?? "Something went wrong"}
        </Text>
        <Text style={{ color: "#8888AA", fontSize: 11, fontFamily: "monospace", textAlign: "center", marginBottom: 16, maxWidth: 400 }}>
          {this.state.error?.message ?? "Unknown error"}
        </Text>
        <Pressable
          onPress={this.handleReset}
          className="px-4 py-2 rounded-xl"
          style={{ backgroundColor: "rgba(0,229,255,0.1)", borderWidth: 1, borderColor: "rgba(0,229,255,0.2)" }}
        >
          <Text style={{ color: "#00E5FF", fontSize: 12, fontWeight: "600" }}>Try Again</Text>
        </Pressable>
      </View>
    );
  }
}
