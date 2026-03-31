// Extracts the project list sidebar so workspace selection stops recreating inline UI trees.
import { memo } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Platform,
} from "react-native";
import { FolderOpen, Plus, X } from "lucide-react-native";
import type { ProjectEntry } from "@/stores/project-store";

interface ProjectSidebarProps {
  activeProjectName: string | null;
  projectList: ProjectEntry[];
  onCreateProject: () => void;
  onRemoveProject: (name: string) => void;
  onSelectProject: (name: string) => void;
}

const ProjectSidebar = ({
  activeProjectName,
  projectList,
  onCreateProject,
  onRemoveProject,
  onSelectProject,
}: ProjectSidebarProps) => (
  <View
    style={{
      width: 180,
      backgroundColor: "rgba(255,255,255,0.45)",
      borderRightWidth: 1,
      borderRightColor: "rgba(0,0,0,0.06)",
      ...(Platform.OS === "web"
        ? { backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }
        : {}),
    } as never}
  >
    <View
      className="px-3 py-2.5 flex-row items-center justify-between"
      style={{ borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.06)" }}
    >
      <View className="flex-row items-center gap-1.5">
        <FolderOpen size={12} color="#7C4DFF" strokeWidth={1.5} />
        <Text
          style={{
            fontSize: 10,
            fontWeight: "700",
            color: "#4A4A6A",
            letterSpacing: 1,
            textTransform: "uppercase",
          }}
        >
          Projects
        </Text>
      </View>
      <Pressable
        onPress={onCreateProject}
        className="w-5 h-5 rounded items-center justify-center"
        style={{ backgroundColor: "rgba(0,229,255,0.1)" }}
      >
        <Plus size={11} color="#00E5FF" strokeWidth={2} />
      </Pressable>
    </View>

    <ScrollView className="flex-1" contentContainerStyle={{ paddingVertical: 4 }}>
      {projectList.map((project) => {
        const isActive = project.name === activeProjectName;
        return (
          <Pressable
            key={project.name}
            onPress={() => onSelectProject(project.name)}
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
                  backgroundColor:
                    project.status === "ready"
                      ? "#00FF88"
                      : project.status === "error"
                        ? "#FF3366"
                        : "#FFD700",
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
                {project.displayName}
              </Text>
            </View>
            <Pressable
              onPress={(event) => {
                event.stopPropagation?.();
                onRemoveProject(project.name);
              }}
              className="w-4 h-4 items-center justify-center rounded opacity-30"
              style={{ marginLeft: 4 }}
            >
              <X size={9} color="#4A4A6A" strokeWidth={1.5} />
            </Pressable>
          </Pressable>
        );
      })}
    </ScrollView>
  </View>
);

export default memo(ProjectSidebar);
