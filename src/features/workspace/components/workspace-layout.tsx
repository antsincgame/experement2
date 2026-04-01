// Extracts the workspace shell so the home screen stops recreating large inline subtrees.
import { memo } from "react";
import { View } from "react-native";
import ChatPanel from "@/features/chat/components/chat-panel";
import FileTree from "@/features/explorer/components/file-tree";
import CodeViewer from "@/features/explorer/components/code-viewer";
import FileTabBar from "@/features/explorer/components/file-tab-bar";
import ProjectSidebar from "@/features/project/components/project-sidebar";
import PreviewPanel from "@/features/preview/components/preview-panel";
import TerminalPanel from "@/features/terminal/components/terminal-panel";
import type { FileNode, ProjectEntry } from "@/stores/project-store";

interface WorkspaceLayoutProps {
  activeFile: string | null;
  fileTree: FileNode[];
  fileTreeVisible: boolean;
  openFiles: string[];
  projectList: ProjectEntry[];
  projectName: string | null;
  terminalVisible: boolean;
  onAbort: () => void;
  onCloseFile: (path: string) => void;
  onCreateProject: () => void;
  onOpenFile: (path: string) => void;
  onRemoveProject: (name: string) => void;
  onSelectFile: (path: string | null) => void;
  onSelectProject: (name: string) => void;
  onSendChat: (text: string) => void;
}

const WorkspaceLayout = ({
  activeFile,
  fileTree,
  fileTreeVisible,
  openFiles,
  projectList,
  projectName,
  terminalVisible,
  onAbort,
  onCloseFile,
  onCreateProject,
  onOpenFile,
  onRemoveProject,
  onSelectFile,
  onSelectProject,
  onSendChat,
}: WorkspaceLayoutProps) => (
  <View className="flex-1 flex-row">
    {projectList.length > 0 && (
      <ProjectSidebar
        activeProjectName={projectName}
        projectList={projectList}
        onCreateProject={onCreateProject}
        onRemoveProject={onRemoveProject}
        onSelectProject={onSelectProject}
      />
    )}

    <View style={{ width: "25%" }}>
      <ChatPanel onSend={onSendChat} onAbort={onAbort} />
    </View>
    <View style={{ width: 1, backgroundColor: "rgba(0,0,0,0.08)" }} />

    <View className="flex-1">
      <View className="flex-1 flex-row">
        {fileTreeVisible && (
          <View style={{ width: 200, backgroundColor: "rgba(255,255,255,0.5)" }}>
            <FileTree nodes={fileTree} activeFile={activeFile} onFilePress={onOpenFile} />
          </View>
        )}
        <View className="flex-1">
          <FileTabBar
            openFiles={openFiles}
            activeFile={activeFile}
            onSelect={onSelectFile}
            onClose={onCloseFile}
          />
          <CodeViewer filepath={activeFile} />
        </View>
      </View>
      {terminalVisible && <TerminalPanel />}
    </View>
    <View style={{ width: 1, backgroundColor: "rgba(0,0,0,0.08)" }} />

    <View style={{ width: "25%" }}>
      <PreviewPanel />
    </View>
  </View>
);

export default memo(WorkspaceLayout);
