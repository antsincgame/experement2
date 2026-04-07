import { ScrollView, Text, View } from "react-native";
import { useWebSyntaxHighlighter } from "@/shared/hooks/use-web-syntax-highlighter";
import { useProjectStore } from "@/stores/project-store";
import { mixedStyle } from "@/shared/lib/web-styles";
import MatrixRain from "./matrix-rain";

interface CodeViewerProps {
  filepath: string | null;
}

const CodeViewer = ({ filepath }: CodeViewerProps) => {
  const fileContents = useProjectStore((s) => s.fileContents);
  const streamingContent = useProjectStore((s) => s.streamingContent);
  const status = useProjectStore((s) => s.status);
  const { SyntaxHighlighter, theme } = useWebSyntaxHighlighter("vscDarkPlus");

  if (!filepath && status === "generating") {
    return (
      <View className="flex-1" style={{ backgroundColor: "#0A0A0A" }}>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16 }}
        >
          <Text style={{ color: "#00E5FF", fontFamily: "monospace", fontSize: 10, opacity: 0.5, marginBottom: 8 }}>
            Generating...
          </Text>
          <Text style={{ color: "#00FF88", fontFamily: "monospace", fontSize: 12, opacity: 0.9, lineHeight: 20 }}>
            {streamingContent.length > 800 ? streamingContent.slice(-800) : streamingContent}
          </Text>
        </ScrollView>
      </View>
    );
  }

  if (!filepath) {
    return (
      <View
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: "#0A0A0A", position: "relative" as const }}
      >
        <MatrixRain />
        <Text style={{ color: "#00FF88", fontSize: 12, opacity: 0.6, zIndex: 1 }}>Select a file to view</Text>
      </View>
    );
  }

  const hasContent = filepath in fileContents;
  const content = fileContents[filepath] ?? "";

  if (!hasContent) {
    return (
      <View
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: "#0A0A0A", position: "relative" as const }}
      >
        <MatrixRain />
        <Text style={{ color: "#00FF88", fontSize: 12, opacity: 0.6, zIndex: 1 }}>Loading {filepath}...</Text>
      </View>
    );
  }

  const lang = getLanguage(filepath);

  // Safety cap: files > 80 KB or > 1000 lines skip syntax highlighting to avoid OOM
  const lineCount = content.split("\n").length;
  const canHighlight =
    SyntaxHighlighter !== null &&
    theme !== null &&
    content.length < 80_000 &&
    lineCount < 1000;

  if (canHighlight) {
    return (
      <View className="flex-1" style={{ backgroundColor: "#0A0A0A", position: "relative" as const }}>
        <MatrixRain />
        <ScrollView className="flex-1" style={{ backgroundColor: "transparent", zIndex: 1 }}>
          <SyntaxHighlighter
            language={lang}
            style={theme}
            showLineNumbers
            lineNumberStyle={{
              minWidth: 40,
              paddingRight: 16,
              color: "#00FF88",
              fontSize: 12,
              userSelect: "none",
              opacity: 0.3,
            }}
            customStyle={{
              margin: 0,
              padding: 16,
              backgroundColor: "rgba(9, 9, 11, 0.75)",
              fontSize: 13,
              lineHeight: 1.6,
              fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            }}
            codeTagProps={{
              style: {
                fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                fontSize: 13,
              },
            }}
          >
            {content}
          </SyntaxHighlighter>
        </ScrollView>
      </View>
    );
  }

  // Fallback: plain text with line numbers
  const lines = content.split("\n");
  return (
    <View className="flex-1" style={{ backgroundColor: "#0A0A0A", position: "relative" as const }}>
      <MatrixRain />
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: "transparent", zIndex: 1 }}
        horizontal
      >
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {lines.map((line, i) => (
            <View key={i} className="flex-row" style={{ minHeight: 20 }}>
              <Text
                className="font-mono text-xs text-right"
                style={mixedStyle({ width: 40, paddingRight: 16, userSelect: "none", color: "#00FF88", opacity: 0.3 })}
              >
                {i + 1}
              </Text>
              <Text className="font-mono text-xs flex-1" style={{ color: "#00FF88" }}>
                {line || " "}
              </Text>
            </View>
          ))}
        </ScrollView>
      </ScrollView>
    </View>
  );
};

const getLanguage = (filepath: string): string => {
  const ext = filepath.split(".").pop() ?? "";
  const map: Record<string, string> = {
    tsx: "tsx",
    ts: "typescript",
    jsx: "jsx",
    js: "javascript",
    json: "json",
    css: "css",
    html: "html",
    md: "markdown",
  };
  return map[ext] ?? "text";
};

export default CodeViewer;
