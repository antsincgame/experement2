import { View, Text, Pressable } from "react-native";
import { useState, memo } from "react";
import {
  Folder,
  FolderOpen,
  FileCode2,
  FileJson,
  FileText,
  File,
  ChevronRight,
  ChevronDown,
} from "lucide-react-native";
import type { FileNode } from "@/stores/project-store";

interface FileTreeProps {
  nodes: FileNode[];
  activeFile: string | null;
  onFilePress: (path: string) => void;
  depth?: number;
}

const FILE_ICON_MAP: Record<string, typeof FileCode2> = {
  tsx: FileCode2,
  ts: FileCode2,
  jsx: FileCode2,
  js: FileCode2,
  json: FileJson,
  md: FileText,
  css: FileText,
};

const getFileIcon = (name: string) => {
  const ext = name.split(".").pop() ?? "";
  return FILE_ICON_MAP[ext] ?? File;
};

const getFileColor = (name: string): string => {
  const ext = name.split(".").pop() ?? "";
  if (ext === "tsx" || ext === "jsx") return "#00F0FF";
  if (ext === "ts" || ext === "js") return "#A1A1AA";
  if (ext === "json") return "#FFD700";
  if (ext === "css") return "#BF00FF";
  return "#52525B";
};

const FileTree = memo(
  ({ nodes, activeFile, onFilePress, depth = 0 }: FileTreeProps) => (
    <View>
      {nodes.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          activeFile={activeFile}
          onFilePress={onFilePress}
          depth={depth}
        />
      ))}
    </View>
  )
);

FileTree.displayName = "FileTree";

interface TreeNodeProps {
  node: FileNode;
  activeFile: string | null;
  onFilePress: (path: string) => void;
  depth: number;
}

const TreeNode = memo(
  ({ node, activeFile, onFilePress, depth }: TreeNodeProps) => {
    const [expanded, setExpanded] = useState(depth < 2);
    const isActive = node.path === activeFile;
    const indent = depth * 16;

    if (node.type === "directory") {
      const Arrow = expanded ? ChevronDown : ChevronRight;
      const FolderIcon = expanded ? FolderOpen : Folder;

      return (
        <View>
          <Pressable
            onPress={() => setExpanded(!expanded)}
            className="flex-row items-center h-7"
            style={{ paddingLeft: indent + 4 }}
          >
            <Arrow size={12} color="#52525B" strokeWidth={1.5} />
            <FolderIcon
              size={14}
              color="#A1A1AA"
              strokeWidth={1.5}
              style={{ marginLeft: 2 }}
            />
            <Text className="text-txt-muted text-xs ml-1.5" numberOfLines={1}>
              {node.name}
            </Text>
          </Pressable>
          {expanded && node.children && (
            <FileTree
              nodes={node.children}
              activeFile={activeFile}
              onFilePress={onFilePress}
              depth={depth + 1}
            />
          )}
        </View>
      );
    }

    const Icon = getFileIcon(node.name);
    const iconColor = getFileColor(node.name);

    return (
      <Pressable
        onPress={() => onFilePress(node.path)}
        className={`flex-row items-center h-7 ${
          isActive ? "bg-accent-cyan-glow" : ""
        }`}
        style={{ paddingLeft: indent + 18 }}
      >
        <Icon size={13} color={iconColor} strokeWidth={1.5} />
        <Text
          className={`text-xs ml-1.5 ${
            isActive ? "text-accent-cyan" : "text-txt-muted"
          }`}
          numberOfLines={1}
        >
          {node.name}
        </Text>
      </Pressable>
    );
  }
);

TreeNode.displayName = "TreeNode";

export default FileTree;
