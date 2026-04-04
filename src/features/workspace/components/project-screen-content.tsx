// Renders the active workspace chrome while the controller hook handles routing and async orchestration.
import { Platform, Pressable, Text, View } from "react-native";
import { Download, Settings, Zap } from "lucide-react-native";
import VersionTimeline from "@/features/history/components/version-timeline";
import SettingsDrawer from "@/features/settings/components/settings-drawer";
import LotusToast from "@/shared/components/effects/lotus-toast";
import AuroraBackground from "@/shared/components/effects/aurora-background";
import WorkspaceLayout from "@/features/workspace/components/workspace-layout";
import type { FileNode, ProjectEntry } from "@/stores/project-store";

interface ProjectScreenContentProps {
  abortGeneration: () => void;
  activeFile: string | null;
  closeFile: (path: string) => void;
  currentGeneratingFile: string | null;
  fileTree: FileNode[];
  fileTreeVisible: boolean;
  generationProgress: number;
  handleChatSend: (text: string) => void;
  handleCreateNew: () => void;
  handleExport: () => void;
  handleSelectProject: (name: string) => void;
  openFile: (path: string) => void;
  openFiles: string[];
  projectList: ProjectEntry[];
  projectName: string | null;
  removeProject: (name: string) => void;
  revertVersion: (commitHash: string) => void;
  routeProjectName: string | null;
  setActiveFile: (path: string | null) => void;
  setSettingsVisible: (value: boolean) => void;
  settingsVisible: boolean;
  setShowLotusToast: (value: boolean) => void;
  showLotusToast: boolean;
  status: string;
  terminalVisible: boolean;
}

export const ProjectScreenContent = ({
  abortGeneration,
  activeFile,
  closeFile,
  currentGeneratingFile,
  fileTree,
  fileTreeVisible,
  generationProgress,
  handleChatSend,
  handleCreateNew,
  handleExport,
  handleSelectProject,
  openFile,
  openFiles,
  projectList,
  projectName,
  removeProject,
  revertVersion,
  routeProjectName,
  setActiveFile,
  setSettingsVisible,
  settingsVisible,
  setShowLotusToast,
  showLotusToast,
  status,
  terminalVisible,
}: ProjectScreenContentProps) => (
  <AuroraBackground intensity="subtle">
    <View className="flex-1">
      <View
        className="h-11 flex-row items-center justify-between px-4"
        style={{
          backgroundColor: "rgba(255,255,255,0.5)",
          borderBottomWidth: 1,
          borderBottomColor: "rgba(0,0,0,0.06)",
          ...(Platform.OS === "web"
            ? { backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }
            : {}),
        } as never}
      >
        <Pressable onPress={handleCreateNew} className="flex-row items-center gap-2.5">
          <View
            className="w-6 h-6 rounded-md items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #00E5FF, #7C4DFF)",
              backgroundColor: "#00E5FF",
            } as never}
          >
            <Zap size={12} color="#FFFFFF" strokeWidth={2} />
          </View>
          <Text className="text-ink-dark text-sm font-semibold">
            {routeProjectName ?? "App Factory"}
          </Text>
          <View
            className="w-2 h-2 rounded-full"
            style={{
              backgroundColor: status === "ready"
                ? "#00FF88"
                : status === "error"
                  ? "#FF3366"
                  : "#FFD700",
            }}
          />
          <Text className="text-ink-light text-[10px] uppercase tracking-wider font-medium">
            {status}
          </Text>
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
        projectName={routeProjectName}
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
