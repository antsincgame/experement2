// Renders the welcome workspace shell while keeping the route component focused on wiring only.
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Bot, Code2, FolderOpen, Settings, Sparkles, Wifi, WifiOff, Zap } from "lucide-react-native";
import { useSettingsStore } from "@/stores/settings-store";
import SuggestionChips from "@/features/chat/components/suggestion-chips";
import SettingsDrawer from "@/features/settings/components/settings-drawer";
import NeonBackground from "@/shared/components/effects/neon-background";
import FlowerOfLife from "@/shared/components/sacred-geometry/flower-of-life";
import Mandala from "@/shared/components/sacred-geometry/mandala";
import { mixedStyle } from "@/shared/lib/web-styles";
import type { ProjectEntry } from "@/stores/project-store";

interface HomeScreenContentProps {
  allProjects: ProjectEntry[];
  creationError: string | null;
  enhanceError: string | null;
  enhancing: boolean;
  enhancerEnabled: boolean;
  handleClearAll: () => void;
  handleCreate: (text: string) => void;
  handleEnhance: () => void;
  handleOpenProject: (name: string) => void;
  inputFocused: boolean;
  isConnected: boolean;
  settingsVisible: boolean;
  setInputFocused: (value: boolean) => void;
  setSettingsVisible: (value: boolean) => void;
  setWelcomeInput: (value: string) => void;
  welcomeInput: string;
}

export const HomeScreenContent = ({
  allProjects,
  creationError,
  enhanceError,
  enhancing,
  enhancerEnabled,
  handleClearAll,
  handleCreate,
  handleEnhance,
  handleOpenProject,
  inputFocused,
  isConnected,
  settingsVisible,
  setInputFocused,
  setSettingsVisible,
  setWelcomeInput,
  welcomeInput,
}: HomeScreenContentProps) => (
  <NeonBackground intensity="vivid">
    <SafeAreaView className="flex-1">
      <View className="flex-1 flex-row">
        {allProjects.length > 0 && (
          <View
            style={mixedStyle({
              width: 220,
              backgroundColor: "rgba(26,26,46,0.85)",
              borderRightWidth: 1,
              borderRightColor: "rgba(0,229,255,0.15)",
              ...(Platform.OS === "web"
                ? { backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }
                : {}),
            })}
          >
            <View
              className="px-4 py-3 flex-row items-center justify-between"
              style={{ borderBottomWidth: 1, borderBottomColor: "rgba(255,215,0,0.15)" }}
            >
              <View className="flex-row items-center gap-2">
                <FolderOpen size={14} color="#FFD700" strokeWidth={1.5} />
                <Text style={{ fontSize: 11, fontWeight: "700", color: "#C0C0D0", letterSpacing: 0.5, textTransform: "uppercase" }}>
                  My Projects ({allProjects.length})
                </Text>
              </View>
              <Pressable onPress={handleClearAll} style={{ padding: 4 }}>
                <Text style={{ fontSize: 9, color: "#FF3366", fontWeight: "600" }}>Clear All</Text>
              </Pressable>
            </View>
            <ScrollView className="flex-1" contentContainerStyle={{ paddingVertical: 4 }}>
              {allProjects.map((project) => (
                <Pressable
                  key={project.name}
                  onPress={() => handleOpenProject(project.name)}
                  className="flex-row items-center gap-2.5 px-4 py-2.5 mx-1.5 my-0.5 rounded-xl"
                  style={{
                    backgroundColor: "rgba(255,215,0,0.06)",
                    borderWidth: 1,
                    borderColor: "rgba(255,215,0,0.15)",
                  }}
                >
                  <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#00FF88" }} />
                  <Text style={{ fontSize: 12, color: "#C0C0D0", fontWeight: "500" }} numberOfLines={1}>
                    {project.displayName}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        <View className="flex-1 items-center justify-center relative overflow-hidden">
          <View className="absolute inset-0 items-center justify-center" style={{ opacity: 0.025 }}>
            <FlowerOfLife size={700} color="#7C4DFF" opacity={1} />
          </View>

          <View className="absolute top-0 left-0 right-0 h-14 flex-row items-center justify-between px-5">
            <View className="flex-row items-center gap-2">
              {isConnected ? (
                <Wifi size={13} color="#00E5FF" strokeWidth={1.5} />
              ) : (
                <WifiOff size={13} color="#FF3366" strokeWidth={1.5} />
              )}
              <Text className={`text-xs font-medium ${isConnected ? "text-neon-cyan" : "text-neon-pink"}`}>
                {isConnected ? "Connected" : "Offline"}
              </Text>
            </View>
            <Pressable
              onPress={() => setSettingsVisible(true)}
              className="w-9 h-9 rounded-xl items-center justify-center"
              style={{
                backgroundColor: "rgba(255,215,0,0.08)",
                borderWidth: 1,
                borderColor: "rgba(255,215,0,0.2)",
              }}
            >
              <Settings size={15} color="#FFD700" strokeWidth={1.5} />
            </Pressable>
          </View>

          <View className="mb-6 animate-float" style={{ opacity: 0.35 }}>
            <Mandala size={150} color="#7C4DFF" spinning={welcomeInput.length > 0} />
          </View>

          <View className="items-center mb-8">
            <View className="flex-row items-center gap-2.5 mb-2">
              <View
                className="w-8 h-8 rounded-xl items-center justify-center"
                style={mixedStyle({
                  background: "linear-gradient(135deg, #FFD700, #00E5FF)",
                  backgroundColor: "#FFD700",
                })}
              >
                <Zap size={16} color="#0A0A0A" strokeWidth={2} />
              </View>
              <Text className="text-white text-3xl font-bold tracking-tight">
                App Factory
              </Text>
            </View>
            <Text className="text-ink-light text-sm">
              Describe your app. AI builds it locally.
            </Text>
          </View>

          <View className="w-full max-w-2xl px-6">
            <View
              className="rounded-2xl overflow-hidden"
              style={mixedStyle({
                backgroundColor: "rgba(26, 26, 46, 0.8)",
                borderWidth: 1.5,
                borderColor: inputFocused
                  ? "rgba(255, 215, 0, 0.5)"
                  : "rgba(255, 215, 0, 0.15)",
                ...(Platform.OS === "web"
                  ? {
                    backdropFilter: "blur(16px)",
                    WebkitBackdropFilter: "blur(16px)",
                    boxShadow: inputFocused
                      ? "0 0 40px rgba(255, 215, 0, 0.2), 0 8px 32px rgba(0,0,0,0.3)"
                      : "0 8px 32px rgba(0,0,0,0.2)",
                    transition: "all 0.3s ease",
                  }
                  : {}),
              })}
            >
              <TextInput
                value={welcomeInput}
                onChangeText={setWelcomeInput}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                placeholder="Describe the app you want to build..."
                placeholderTextColor="#4A4A6A"
                multiline
                className="text-white text-base px-5 py-5"
                style={mixedStyle({
                  minHeight: 80,
                  fontFamily: "Inter, system-ui, sans-serif",
                  outlineStyle: "none",
                })}
              />

              <View
                className="flex-row items-center justify-between px-4 py-3"
                style={{ borderTopWidth: 1, borderTopColor: "rgba(255,215,0,0.1)" }}
              >
                <MoEIndicator />
                <View className="flex-row items-center gap-2">
                  {enhancerEnabled && (
                    <Pressable
                      onPress={handleEnhance}
                      disabled={enhancing || !welcomeInput.trim()}
                      className="flex-row items-center gap-1.5 px-3 py-2 rounded-xl"
                      style={{
                        backgroundColor: welcomeInput.trim() ? "rgba(124, 77, 255, 0.15)" : "rgba(255,255,255,0.03)",
                        borderWidth: 1,
                        borderColor: welcomeInput.trim() ? "rgba(124,77,255,0.3)" : "rgba(255,255,255,0.06)",
                      }}
                    >
                      {enhancing ? (
                        <ActivityIndicator size="small" color="#B388FF" />
                      ) : (
                        <Sparkles size={13} color={welcomeInput.trim() ? "#B388FF" : "#4A4A6A"} strokeWidth={1.5} />
                      )}
                      <Text style={{ fontSize: 11, fontWeight: "600", color: welcomeInput.trim() ? "#B388FF" : "#4A4A6A" }}>
                        {enhancing ? "Improving..." : "Enhance"}
                      </Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => handleCreate(welcomeInput)}
                    disabled={!welcomeInput.trim() || !isConnected}
                    className="flex-row items-center gap-2 px-4 py-2 rounded-xl"
                    style={mixedStyle({
                      backgroundColor: welcomeInput.trim() && isConnected
                        ? "#FFD700"
                        : "rgba(255,255,255,0.04)",
                      ...(welcomeInput.trim() && isConnected && Platform.OS === "web"
                        ? {
                          boxShadow: "0 0 30px rgba(255, 215, 0, 0.3)",
                        }
                        : {}),
                    })}
                  >
                    <Zap
                      size={13}
                      color={welcomeInput.trim() && isConnected ? "#0A0A0A" : "#4A4A6A"}
                      strokeWidth={2}
                    />
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "700",
                        color: welcomeInput.trim() && isConnected ? "#0A0A0A" : "#4A4A6A",
                      }}
                    >
                      Generate
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>

          {(creationError || enhanceError) && (
            <View
              className="w-full max-w-2xl px-6 mt-3"
              accessibilityRole="alert"
            >
              <View
                className="rounded-xl px-4 py-3"
                style={{
                  backgroundColor: "rgba(255, 51, 102, 0.1)",
                  borderWidth: 1,
                  borderColor: "rgba(255, 51, 102, 0.3)",
                }}
              >
                <Text style={{ fontSize: 13, color: "#FF3366", fontWeight: "600" }}>
                  {creationError || enhanceError}
                </Text>
              </View>
            </View>
          )}

          <SuggestionChips onSelect={setWelcomeInput} />
        </View>
      </View>

      <SettingsDrawer visible={settingsVisible} onClose={() => setSettingsVisible(false)} />
    </SafeAreaView>
  </NeonBackground>
);

const MoEIndicator = () => {
  const model = useSettingsStore((s) => s.model);
  const plannerModel = useSettingsStore((s) => s.plannerModel);
  const shortName = (m: string) => m.split("/").pop()?.slice(0, 18) || "Auto";

  return (
    <View className="flex-row items-center gap-2">
      <View className="flex-row items-center gap-1">
        <Bot size={10} color="#7C4DFF" strokeWidth={1.5} />
        <Text style={{ fontSize: 8, color: "#7C4DFF", fontWeight: "600" }}>
          {shortName(plannerModel || model)}
        </Text>
      </View>
      <View style={{ width: 1, height: 10, backgroundColor: "rgba(255,215,0,0.2)" }} />
      <View className="flex-row items-center gap-1">
        <Code2 size={10} color="#00E5FF" strokeWidth={1.5} />
        <Text style={{ fontSize: 8, color: "#00E5FF", fontWeight: "600" }}>
          {shortName(model)}
        </Text>
      </View>
    </View>
  );
};
