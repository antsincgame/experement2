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
import { FolderOpen, Settings, Sparkles, Wifi, WifiOff, Zap } from "lucide-react-native";
import SuggestionChips from "@/features/chat/components/suggestion-chips";
import SettingsDrawer from "@/features/settings/components/settings-drawer";
import AuroraBackground from "@/shared/components/effects/aurora-background";
import FlowerOfLife from "@/shared/components/sacred-geometry/flower-of-life";
import Mandala from "@/shared/components/sacred-geometry/mandala";
import type { ProjectEntry } from "@/stores/project-store";

interface HomeScreenContentProps {
  allProjects: ProjectEntry[];
  creationError: string | null;
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
  <AuroraBackground intensity="vivid">
    <SafeAreaView className="flex-1">
      <View className="flex-1 flex-row">
        {allProjects.length > 0 && (
          <View
            style={{
              width: 220,
              backgroundColor: "rgba(255,255,255,0.3)",
              borderRightWidth: 1,
              borderRightColor: "rgba(255,255,255,0.5)",
              ...(Platform.OS === "web"
                ? { backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }
                : {}),
            } as never}
          >
            <View
              className="px-4 py-3 flex-row items-center justify-between"
              style={{ borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.4)" }}
            >
              <View className="flex-row items-center gap-2">
                <FolderOpen size={14} color="#7C4DFF" strokeWidth={1.5} />
                <Text style={{ fontSize: 11, fontWeight: "700", color: "#4A4A6A", letterSpacing: 0.5, textTransform: "uppercase" }}>
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
                    backgroundColor: "rgba(255,255,255,0.35)",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.5)",
                  }}
                >
                  <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#00FF88" }} />
                  <Text style={{ fontSize: 12, color: "#4A4A6A", fontWeight: "500" }} numberOfLines={1}>
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
                backgroundColor: "rgba(255,255,255,0.5)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.7)",
              }}
            >
              <Settings size={15} color="#4A4A6A" strokeWidth={1.5} />
            </Pressable>
          </View>

          <View className="mb-6 animate-float" style={{ opacity: 0.35 }}>
            <Mandala size={150} color="#7C4DFF" spinning={welcomeInput.length > 0} />
          </View>

          <View className="items-center mb-8">
            <View className="flex-row items-center gap-2.5 mb-2">
              <View
                className="w-8 h-8 rounded-xl items-center justify-center"
                style={{
                  background: "linear-gradient(135deg, #00E5FF, #7C4DFF)",
                  backgroundColor: "#00E5FF",
                } as never}
              >
                <Zap size={16} color="#FFFFFF" strokeWidth={2} />
              </View>
              <Text className="text-ink-dark text-3xl font-bold tracking-tight">
                App Factory
              </Text>
            </View>
            <Text className="text-ink-muted text-sm">
              Describe your app. AI builds it locally.
            </Text>
          </View>

          <View className="w-full max-w-2xl px-6">
            <View
              className="rounded-2xl overflow-hidden"
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.55)",
                borderWidth: 1.5,
                borderColor: inputFocused
                  ? "rgba(0, 229, 255, 0.5)"
                  : "rgba(255, 255, 255, 0.7)",
                ...(Platform.OS === "web"
                  ? {
                    backdropFilter: "blur(16px)",
                    WebkitBackdropFilter: "blur(16px)",
                    boxShadow: inputFocused
                      ? "0 0 40px rgba(0, 229, 255, 0.2), 0 8px 32px rgba(0,0,0,0.06)"
                      : "0 8px 32px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)",
                    transition: "all 0.3s ease",
                  }
                  : {}),
              } as never}
            >
              <TextInput
                value={welcomeInput}
                onChangeText={setWelcomeInput}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                placeholder="Describe the app you want to build..."
                placeholderTextColor="#8888AA"
                multiline
                className="text-ink-dark text-base px-5 py-5"
                style={{
                  minHeight: 80,
                  fontFamily: "Inter, system-ui, sans-serif",
                  outlineStyle: "none",
                } as never}
              />

              <View
                className="flex-row items-center justify-between px-4 py-3"
                style={{ borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.04)" }}
              >
                <View className="flex-row items-center gap-1.5">
                  <Sparkles size={12} color="#7C4DFF" strokeWidth={1.5} />
                  <Text className="text-ink-light text-[10px] font-medium">
                    Powered by local LLM
                  </Text>
                </View>
                <View className="flex-row items-center gap-2">
                  {enhancerEnabled && (
                    <Pressable
                      onPress={handleEnhance}
                      disabled={enhancing || !welcomeInput.trim()}
                      className="flex-row items-center gap-1.5 px-3 py-2 rounded-xl"
                      style={{
                        backgroundColor: welcomeInput.trim() ? "rgba(124, 77, 255, 0.12)" : "rgba(0,0,0,0.03)",
                        borderWidth: 1,
                        borderColor: welcomeInput.trim() ? "rgba(124,77,255,0.2)" : "rgba(0,0,0,0.04)",
                      }}
                    >
                      {enhancing ? (
                        <ActivityIndicator size="small" color="#7C4DFF" />
                      ) : (
                        <Sparkles size={13} color={welcomeInput.trim() ? "#7C4DFF" : "#AAAACC"} strokeWidth={1.5} />
                      )}
                      <Text style={{ fontSize: 11, fontWeight: "600", color: welcomeInput.trim() ? "#7C4DFF" : "#AAAACC" }}>
                        {enhancing ? "Improving..." : "Enhance"}
                      </Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => handleCreate(welcomeInput)}
                    disabled={!welcomeInput.trim() || !isConnected}
                    className="flex-row items-center gap-2 px-4 py-2 rounded-xl"
                    style={{
                      backgroundColor: welcomeInput.trim() && isConnected
                        ? "#00E5FF"
                        : "rgba(0,0,0,0.04)",
                      ...(welcomeInput.trim() && isConnected && Platform.OS === "web"
                        ? {
                          background: "linear-gradient(135deg, #00E5FF, #7C4DFF)",
                          boxShadow: "0 4px 20px rgba(0, 229, 255, 0.35)",
                        }
                        : {}),
                    } as never}
                  >
                    <Zap
                      size={13}
                      color={welcomeInput.trim() && isConnected ? "#FFFFFF" : "#8888AA"}
                      strokeWidth={2}
                    />
                    <Text
                      className={`text-xs font-bold ${
                        welcomeInput.trim() && isConnected ? "text-white" : "text-ink-light"
                      }`}
                    >
                      Generate
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>

          {creationError && (
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
                  {creationError}
                </Text>
              </View>
            </View>
          )}

          <SuggestionChips onSelect={setWelcomeInput} />
        </View>
      </View>

      <SettingsDrawer visible={settingsVisible} onClose={() => setSettingsVisible(false)} />
    </SafeAreaView>
  </AuroraBackground>
);
