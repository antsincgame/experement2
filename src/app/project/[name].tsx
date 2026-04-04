import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useCallback } from "react";
import { View, Text, Pressable, Platform, Linking } from "react-native";
import { Zap, Settings, Download } from "lucide-react-native";
import { useProjectStore, fetchProjectFiles } from "@/stores/project-store";
import { useWebSocket } from "@/shared/hooks/use-websocket";
import { apiClient } from "@/shared/lib/api-client";
import WorkspaceLayout from "@/features/workspace/components/workspace-layout";
import VersionTimeline from "@/features/history/components/version-timeline";
import SettingsDrawer from "@/features/settings/components/settings-drawer";
import LotusToast from "@/shared/components/effects/lotus-toast";
import AuroraBackground from "@/shared/components/effects/aurora-background";
import { useState, useRef } from "react";
import { createUserMessage } from "@/features/chat/schemas/message.schema";

export default function ProjectScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const router = useRouter();
  const { iterate, abortGeneration, revertVersion, startPreview } = useWebSocket();

  const projectName = useProjectStore((s) => s.projectName);
  const status = useProjectStore((s) => s.status);
  const fileTree = useProjectStore((s) => s.fileTree);
  const openFiles = useProjectStore((s) => s.openFiles);
  const activeFile = useProjectStore((s) => s.activeFile);
  const fileTreeVisible = useProjectStore((s) => s.fileTreeVisible);
  const terminalVisible = useProjectStore((s) => s.terminalVisible);
  const generationProgress = useProjectStore((s) => s.generationProgress);
  const currentGeneratingFile = useProjectStore((s) => s.currentGeneratingFile);
  const projectList = useProjectStore((s) => s.projectList);
  const addMessage = useProjectStore((s) => s.addMessage);
  const openFile = useProjectStore((s) => s.openFile);
  const closeFile = useProjectStore((s) => s.closeFile);
  const setActiveFile = useProjectStore((s) => s.setActiveFile);
  const setStatus = useProjectStore((s) => s.setStatus);
  const switchProject = useProjectStore((s) => s.switchProject);
  const removeProject = useProjectStore((s) => s.removeProject);

  const [settingsVisible, setSettingsVisible] = useState(false);
  const [showLotusToast, setShowLotusToast] = useState(false);

  const prevStatus = useRef(status);
  useEffect(() => {
    if (prevStatus.current !== "ready" && status === "ready" && projectName) {
      setShowLotusToast(true);
    }
    prevStatus.current = status;
  }, [status, projectName]);

  // Sync URL param to store on mount
  useEffect(() => {
    if (name && name !== projectName) {
      switchProject(name);
      void fetchProjectFiles(name);
      startPreview(name);
    }
  }, [name]);

  const handleChatSend = useCallback(
    (text: string) => {
      addMessage(createUserMessage(text));
      iterate(text);
    },
    [addMessage, iterate]
  );

  const handleSelectProject = useCallback((selectedName: string) => {
    router.push(`/project/${encodeURIComponent(selectedName)}`);
  }, [router]);

  const handleCreateNew = useCallback(() => {
    router.push("/");
  }, [router]);

  const handleExport = useCallback(() => {
    if (!projectName) return;
    void Linking.openURL(apiClient.getProjectExportUrl(projectName));
  }, [projectName]);

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
          <Pressable onPress={handleCreateNew} className="flex-row items-center gap-2.5">
            <View
              className="w-6 h-6 rounded-md items-center justify-center"
              style={{ background: "linear-gradient(135deg, #00E5FF, #7C4DFF)", backgroundColor: "#00E5FF" } as never}
            >
              <Zap size={12} color="#FFFFFF" strokeWidth={2} />
            </View>
            <Text className="text-ink-dark text-sm font-semibold">{name ?? "App Factory"}</Text>
            <View
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor:
                  status === "ready" ? "#00FF88" : status === "error" ? "#FF3366" : "#FFD700",
              }}
            />
            <Text className="text-ink-light text-[10px] uppercase tracking-wider font-medium">{status}</Text>
            {currentGeneratingFile && !["idle", "ready", "error"].includes(status) && (
              <Text style={{ fontSize: 10, color: "#00BCD4", fontFamily: "monospace", marginLeft: 6 }} numberOfLines={1}>
                {currentGeneratingFile}
              </Text>
            )}
            {generationProgress > 0 && generationProgress < 1 && (
              <Text style={{ fontSize: 9, color: "#888", fontWeight: "600", marginLeft: 4 }}>
                {Math.round(generationProgress * 100)}%
              </Text>
            )}
          </Pressable>
          <View className="flex-row items-center gap-2">
            {projectName && (
              <Pressable
                onPress={handleExport}
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

        {/* Progress bar */}
        {generationProgress > 0 && generationProgress < 1 && (
          <View style={{ height: 2, backgroundColor: "rgba(0,0,0,0.04)" }}>
            <View
              style={{
                height: "100%",
                width: `${generationProgress * 100}%`,
                backgroundColor: "#00E5FF",
                ...(Platform.OS === "web" ? { transition: "width 0.3s ease" } : {}),
              } as never}
            />
          </View>
        )}

        <WorkspaceLayout
          activeFile={activeFile}
          fileTree={fileTree}
          fileTreeVisible={fileTreeVisible}
          openFiles={openFiles}
          projectList={projectList}
          projectName={name ?? null}
          terminalVisible={terminalVisible}
          onAbort={abortGeneration}
          onCloseFile={closeFile}
          onCreateProject={handleCreateNew}
          onOpenFile={openFile}
          onRemoveProject={removeProject}
          onSelectFile={setActiveFile}
          onSelectProject={handleSelectProject}
          onSendChat={handleChatSend}
        />

        <VersionTimeline onRevert={revertVersion} />
        <SettingsDrawer visible={settingsVisible} onClose={() => setSettingsVisible(false)} />
        <LotusToast visible={showLotusToast} onHide={() => setShowLotusToast(false)} />
      </View>
    </AuroraBackground>
  );
}
