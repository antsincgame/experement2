import { View, Text, Pressable, ScrollView } from "react-native";
import { X, FileCode2 } from "lucide-react-native";

interface FileTabBarProps {
  openFiles: string[];
  activeFile: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}

const getFileName = (path: string): string =>
  path.split("/").pop() ?? path;

const FileTabBar = ({
  openFiles,
  activeFile,
  onSelect,
  onClose,
}: FileTabBarProps) => {
  if (openFiles.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="border-b border-border-subtle"
      style={{ backgroundColor: "#0D0D10", maxHeight: 36 }}
    >
      {openFiles.map((file) => {
        const isActive = file === activeFile;
        return (
          <View
            key={file}
            className="flex-row items-center"
            style={{
              borderTopWidth: isActive ? 2 : 0,
              borderTopColor: "#00F0FF",
              backgroundColor: isActive ? "#09090B" : "transparent",
            }}
          >
            <Pressable
              onPress={() => onSelect(file)}
              className="flex-row items-center gap-1.5 px-3 h-9"
            >
              <FileCode2
                size={12}
                color={isActive ? "#00F0FF" : "#52525B"}
                strokeWidth={1.5}
              />
              <Text
                className={`text-xs ${
                  isActive ? "text-txt-main" : "text-txt-dim"
                }`}
                numberOfLines={1}
              >
                {getFileName(file)}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => onClose(file)}
              className="pr-2 opacity-0 hover:opacity-100"
              style={{ opacity: isActive ? 0.5 : 0 }}
            >
              <X size={11} color="#A1A1AA" strokeWidth={1.5} />
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
};

export default FileTabBar;
