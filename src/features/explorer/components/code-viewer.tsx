import { View, Text, ScrollView } from "react-native";
import { Platform } from "react-native";
import { useProjectStore } from "@/stores/project-store";

let SyntaxHighlighter: typeof import("react-syntax-highlighter").default | null = null;
let vscDarkPlus: Record<string, React.CSSProperties> | null = null;

if (Platform.OS === "web") {
  try {
    const rsh = require("react-syntax-highlighter");
    const styles = require("react-syntax-highlighter/dist/esm/styles/prism");
    SyntaxHighlighter = rsh.Prism;
    vscDarkPlus = styles.vscDarkPlus;
  } catch {
    // fallback to plain text
  }
}

interface CodeViewerProps {
  filepath: string | null;
}

const CodeViewer = ({ filepath }: CodeViewerProps) => {
  const fileContents = useProjectStore((s) => s.fileContents);
  const streamingContent = useProjectStore((s) => s.streamingContent);
  const status = useProjectStore((s) => s.status);

  if (!filepath && status === "generating") {
    return (
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: "#09090B" }}
        contentContainerStyle={{ padding: 16 }}
      >
        <Text className="text-accent-cyan text-xs font-mono opacity-40 mb-2">
          Generating...
        </Text>
        <Text className="text-status-success font-mono text-xs opacity-70 leading-5">
          {streamingContent}
        </Text>
      </ScrollView>
    );
  }

  if (!filepath) {
    return (
      <View
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: "#09090B" }}
      >
        <Text className="text-txt-dim text-xs">Select a file to view</Text>
      </View>
    );
  }

  const content = fileContents[filepath] ?? "";

  if (!content) {
    return (
      <View
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: "#09090B" }}
      >
        <Text className="text-txt-dim text-xs">Loading {filepath}...</Text>
      </View>
    );
  }

  const lang = getLanguage(filepath);

  if (Platform.OS === "web" && SyntaxHighlighter && vscDarkPlus) {
    const Highlighter = SyntaxHighlighter;
    const theme = vscDarkPlus;
    return (
      <ScrollView className="flex-1" style={{ backgroundColor: "#09090B" }}>
        <Highlighter
          language={lang}
          style={theme}
          showLineNumbers
          lineNumberStyle={{
            minWidth: 40,
            paddingRight: 16,
            color: "#52525B",
            fontSize: 12,
            userSelect: "none",
          }}
          customStyle={{
            margin: 0,
            padding: 16,
            backgroundColor: "#09090B",
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
        </Highlighter>
      </ScrollView>
    );
  }

  // Fallback: plain text with line numbers
  const lines = content.split("\n");
  return (
    <ScrollView
      className="flex-1"
      style={{ backgroundColor: "#09090B" }}
      horizontal
    >
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {lines.map((line, i) => (
          <View key={i} className="flex-row" style={{ minHeight: 20 }}>
            <Text
              className="text-txt-dim font-mono text-xs text-right"
              style={{ width: 40, paddingRight: 16, userSelect: "none" } as never}
            >
              {i + 1}
            </Text>
            <Text className="text-txt-main font-mono text-xs flex-1">
              {line || " "}
            </Text>
          </View>
        ))}
      </ScrollView>
    </ScrollView>
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
