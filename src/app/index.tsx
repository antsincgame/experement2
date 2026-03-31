import { useState, useCallback, useRef, useEffect } from "react";
import { View, Text, TextInput, Pressable, Platform, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Settings, Zap, Sparkles, Wifi, WifiOff, Download, X, Plus, FolderOpen } from "lucide-react-native";

import { useProjectStore, fetchProjectFiles } from "@/stores/project-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useWebSocket } from "@/shared/hooks/use-websocket";
import { createUserMessage } from "@/features/chat/schemas/message.schema";

import AuroraBackground from "@/shared/components/effects/aurora-background";
import ChatPanel from "@/features/chat/components/chat-panel";
import SuggestionChips from "@/features/chat/components/suggestion-chips";
import FileTree from "@/features/explorer/components/file-tree";
import CodeViewer from "@/features/explorer/components/code-viewer";
import FileTabBar from "@/features/explorer/components/file-tab-bar";
import PreviewPanel from "@/features/preview/components/preview-panel";
import TerminalPanel from "@/features/terminal/components/terminal-panel";
import SettingsDrawer from "@/features/settings/components/settings-drawer";
import VersionTimeline from "@/features/history/components/version-timeline";
import FlowerOfLife from "@/shared/components/sacred-geometry/flower-of-life";
import Mandala from "@/shared/components/sacred-geometry/mandala";
import LotusToast from "@/shared/components/effects/lotus-toast";

// react-resizable-panels disabled: uses import.meta which breaks Hermes bundler

export default function AppFactoryScreen() {
  const { createProject, iterate, abortGeneration, revertVersion } = useWebSocket();

  const projectName = useProjectStore((s) => s.projectName);
  const status = useProjectStore((s) => s.status);
  const isConnected = useProjectStore((s) => s.isConnected);
  const fileTree = useProjectStore((s) => s.fileTree);
  const openFiles = useProjectStore((s) => s.openFiles);
  const activeFile = useProjectStore((s) => s.activeFile);
  const fileTreeVisible = useProjectStore((s) => s.fileTreeVisible);
  const terminalVisible = useProjectStore((s) => s.terminalVisible);
  const projectList = useProjectStore((s) => s.projectList);
  const addMessage = useProjectStore((s) => s.addMessage);
  const openFile = useProjectStore((s) => s.openFile);
  const closeFile = useProjectStore((s) => s.closeFile);
  const setActiveFile = useProjectStore((s) => s.setActiveFile);
  const setStatus = useProjectStore((s) => s.setStatus);
  const switchProject = useProjectStore((s) => s.switchProject);
  const removeProject = useProjectStore((s) => s.removeProject);

  const [settingsVisible, setSettingsVisible] = useState(false);
  const [welcomeInput, setWelcomeInput] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const [showLotusToast, setShowLotusToast] = useState(false);
  const [enhancing, setEnhancing] = useState(false);

  const enhancerEnabled = useSettingsStore((s) => s.enhancerEnabled);
  const enhancerModel = useSettingsStore((s) => s.enhancerModel);
  const agentUrl = useSettingsStore((s) => s.agentUrl);
  const lmStudioUrl = useSettingsStore((s) => s.lmStudioUrl);

  const handleEnhance = useCallback(async () => {
    const trimmed = welcomeInput.trim();
    if (!trimmed) return;
    setEnhancing(true);
    try {
      const resp = await fetch(`${agentUrl}/api/llm/enhance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed, model: enhancerModel || undefined, lmStudioUrl }),
      });
      if (resp.ok) {
        const { data } = await resp.json();
        if (data) setWelcomeInput(data);
      }
    } catch { /* silent */ }
    finally { setEnhancing(false); }
  }, [welcomeInput, agentUrl, enhancerModel, lmStudioUrl]);

  const prevStatus = useRef(status);
  useEffect(() => {
    if (prevStatus.current !== "ready" && status === "ready" && projectName) {
      setShowLotusToast(true);
    }
    prevStatus.current = status;
  }, [status, projectName]);

  const isWorkspace = projectName !== null || !["idle", "error"].includes(status);

  const handleCreate = useCallback(
    (text: string) => {
      addMessage(createUserMessage(text));
      setStatus("planning");
      createProject(text);
    },
    [addMessage, setStatus, createProject]
  );

  const handleChatSend = useCallback(
    (text: string) => {
      addMessage(createUserMessage(text));
      if (!projectName) handleCreate(text);
      else iterate(text);
    },
    [addMessage, projectName, handleCreate, iterate]
  );

  // ── WELCOME ────────────────────────────────────────────
  if (!isWorkspace) {
    return (
      <AuroraBackground intensity="vivid">
        <SafeAreaView className="flex-1">
          <View className="flex-1 items-center justify-center relative overflow-hidden">
            {/* Flower of Life background */}
            <View className="absolute inset-0 items-center justify-center" style={{ opacity: 0.025 }}>
              <FlowerOfLife size={700} color="#7C4DFF" opacity={1} />
            </View>

            {/* Top bar */}
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

            {/* Mandala */}
            <View className="mb-6 animate-float" style={{ opacity: 0.35 }}>
              <Mandala
                size={150}
                color="#7C4DFF"
                spinning={welcomeInput.length > 0}
              />
            </View>

            {/* Title */}
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

            {/* Glass input */}
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
                  {/* Enhance button */}
                  {enhancerEnabled && welcomeInput.trim().length > 0 && (
                    <Pressable
                      onPress={handleEnhance}
                      disabled={enhancing}
                      className="flex-row items-center gap-1.5 px-3 py-2 rounded-xl"
                      style={{ backgroundColor: "rgba(124, 77, 255, 0.12)", borderWidth: 1, borderColor: "rgba(124,77,255,0.2)" }}
                    >
                      {enhancing ? (
                        <ActivityIndicator size="small" color="#7C4DFF" />
                      ) : (
                        <Sparkles size={13} color="#7C4DFF" strokeWidth={1.5} />
                      )}
                      <Text style={{ fontSize: 11, fontWeight: "600", color: "#7C4DFF" }}>
                        {enhancing ? "Improving..." : "Enhance"}
                      </Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => {
                      if (welcomeInput.trim() && isConnected) handleCreate(welcomeInput.trim());
                    }}
                    disabled={!welcomeInput.trim() || !isConnected}
                    className="flex-row items-center gap-2 px-4 py-2 rounded-xl"
                    style={{
                      backgroundColor:
                        welcomeInput.trim() && isConnected
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

            <SuggestionChips onSelect={setWelcomeInput} />
          </View>

          <SettingsDrawer visible={settingsVisible} onClose={() => setSettingsVisible(false)} />
        </SafeAreaView>
      </AuroraBackground>
    );
  }

  // ── PROJECT SIDEBAR ──────────────────────────────────────
  const projectSidebar = () => (
    <View
      style={{
        width: 180,
        backgroundColor: "rgba(255,255,255,0.45)",
        borderRightWidth: 1,
        borderRightColor: "rgba(0,0,0,0.06)",
        ...(Platform.OS === "web" ? { backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" } : {}),
      } as never}
    >
      {/* Sidebar Header */}
      <View className="px-3 py-2.5 flex-row items-center justify-between"
        style={{ borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.06)" }}
      >
        <View className="flex-row items-center gap-1.5">
          <FolderOpen size={12} color="#7C4DFF" strokeWidth={1.5} />
          <Text style={{ fontSize: 10, fontWeight: "700", color: "#4A4A6A", letterSpacing: 1, textTransform: "uppercase" }}>
            Projects
          </Text>
        </View>
        <Pressable
          onPress={() => {
            setStatus("idle");
            useProjectStore.setState({ projectName: null });
          }}
          className="w-5 h-5 rounded items-center justify-center"
          style={{ backgroundColor: "rgba(0,229,255,0.1)" }}
        >
          <Plus size={11} color="#00E5FF" strokeWidth={2} />
        </Pressable>
      </View>

      {/* Project List */}
      <View className="flex-1 py-1">
        {projectList.map((p) => {
          const isActive = p.name === projectName;
          return (
            <Pressable
              key={p.name}
              onPress={() => {
                switchProject(p.name);
                fetchProjectFiles("http://localhost:3100", p.name);
              }}
              className="flex-row items-center px-3 py-2 mx-1 rounded-lg"
              style={{
                backgroundColor: isActive ? "rgba(0,229,255,0.1)" : "transparent",
                borderWidth: isActive ? 1 : 0,
                borderColor: "rgba(0,229,255,0.25)",
              }}
            >
              <View className="flex-row items-center gap-2 flex-1" style={{ minWidth: 0 }}>
                <View
                  className="w-2 h-2 rounded-full"
                  style={{
                    backgroundColor: p.status === "ready" ? "#00FF88" : p.status === "error" ? "#FF3366" : "#FFD700",
                  }}
                />
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: isActive ? "600" : "400",
                    color: isActive ? "#00BCD4" : "#4A4A6A",
                  }}
                  numberOfLines={1}
                >
                  {p.displayName}
                </Text>
              </View>
              <Pressable
                onPress={(e) => {
                  e.stopPropagation?.();
                  removeProject(p.name);
                }}
                className="w-4 h-4 items-center justify-center rounded opacity-30"
                style={{ marginLeft: 4 }}
              >
                <X size={9} color="#4A4A6A" strokeWidth={1.5} />
              </Pressable>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  // ── WORKSPACE ──────────────────────────────────────────
  const workspace = () => (
      <View className="flex-1 flex-row">
        {/* Project Sidebar */}
        {projectList.length > 0 && projectSidebar()}

        {/* Chat Panel */}
        <View style={{ width: "25%" }}>
          <ChatPanel onSend={handleChatSend} onAbort={abortGeneration} />
        </View>
        <View style={{ width: 1, backgroundColor: "rgba(0,0,0,0.08)" }} />

        {/* Code Area */}
        <View className="flex-1">
          <View className="flex-1 flex-row">
            {fileTreeVisible && (
              <View style={{ width: 200, backgroundColor: "rgba(255,255,255,0.5)" }}>
                <FileTree nodes={fileTree} activeFile={activeFile} onFilePress={openFile} />
              </View>
            )}
            <View className="flex-1">
              <FileTabBar openFiles={openFiles} activeFile={activeFile} onSelect={setActiveFile} onClose={closeFile} />
              <CodeViewer filepath={activeFile} />
            </View>
          </View>
          {terminalVisible && <TerminalPanel />}
        </View>
        <View style={{ width: 1, backgroundColor: "rgba(0,0,0,0.08)" }} />

        {/* Preview */}
        <View style={{ width: "25%" }}>
          <PreviewPanel />
        </View>
      </View>
  );

  return (
    <AuroraBackground intensity="subtle">
      <View className="flex-1">
        {/* Header */}
        <View
          className="h-11 flex-row items-center justify-between px-4"
          style={{
            backgroundColor: "rgba(255,255,255,0.5)",
            borderBottomWidth: 1,
            borderBottomColor: "rgba(0,0,0,0.06)",
            ...(Platform.OS === "web" ? { backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" } : {}),
          } as never}
        >
          <View className="flex-row items-center gap-2.5">
            <View
              className="w-6 h-6 rounded-md items-center justify-center"
              style={{ background: "linear-gradient(135deg, #00E5FF, #7C4DFF)", backgroundColor: "#00E5FF" } as never}
            >
              <Zap size={12} color="#FFFFFF" strokeWidth={2} />
            </View>
            <Text className="text-ink-dark text-sm font-semibold">{projectName ?? "App Factory"}</Text>
            <View
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor:
                  status === "ready" ? "#00FF88" : status === "error" ? "#FF3366" : "#FFD700",
                ...(status !== "ready" && status !== "error"
                  ? { shadowColor: "#FFD700", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 4 }
                  : {}),
              }}
            />
            <Text className="text-ink-light text-[10px] uppercase tracking-wider font-medium">{status}</Text>
          </View>
          <View className="flex-row items-center gap-2">
            {projectName && (
              <Pressable
                onPress={() => {
                  if (projectName) {
                    window.open(`http://localhost:3100/api/projects/${projectName}/export`, "_blank");
                  }
                }}
                className="w-8 h-8 rounded-lg items-center justify-center"
                style={{ backgroundColor: "rgba(0,229,255,0.1)", borderWidth: 1, borderColor: "rgba(0,229,255,0.2)" }}
              >
                <Download size={13} color="#00E5FF" strokeWidth={1.5} />
              </Pressable>
            )}
            <Pressable
              onPress={() => setSettingsVisible(true)}
              className="w-8 h-8 rounded-lg items-center justify-center"
              style={{ backgroundColor: "rgba(255,255,255,0.5)", borderWidth: 1, borderColor: "rgba(255,255,255,0.7)" }}
            >
              <Settings size={14} color="#4A4A6A" strokeWidth={1.5} />
            </Pressable>
          </View>
        </View>

        {workspace()}

        <VersionTimeline onRevert={revertVersion} />
        <SettingsDrawer visible={settingsVisible} onClose={() => setSettingsVisible(false)} />
        <LotusToast visible={showLotusToast} onHide={() => setShowLotusToast(false)} />
      </View>
    </AuroraBackground>
  );
}
