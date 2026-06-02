// Editable code panel: CodeMirror on web, multiline fallback on native, save via agent PUT /file; Matrix rain removed.
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Save, RotateCcw } from "lucide-react-native";
import { useWebSyntaxHighlighter } from "@/shared/hooks/use-web-syntax-highlighter";
import { useWebCodeEditor } from "@/shared/hooks/use-web-code-editor";
import { apiClient } from "@/shared/lib/api-client";
import { getEditorContent, isFileDirty } from "@/shared/lib/file-editor";
import { useProjectStore } from "@/stores/project-store";
import { mixedStyle } from "@/shared/lib/web-styles";

interface CodeViewerProps {
  filepath: string | null;
}

const CodeViewer = ({ filepath }: CodeViewerProps) => {
  const projectName = useProjectStore((s) => s.projectName);
  const fileContents = useProjectStore((s) => s.fileContents);
  const fileDrafts = useProjectStore((s) => s.fileDrafts);
  const streamingContent = useProjectStore((s) => s.streamingContent);
  const status = useProjectStore((s) => s.status);
  const setFileDraft = useProjectStore((s) => s.setFileDraft);
  const revertFileDraft = useProjectStore((s) => s.revertFileDraft);
  const setFileContent = useProjectStore((s) => s.setFileContent);
  const clearFileDraft = useProjectStore((s) => s.clearFileDraft);

  const { SyntaxHighlighter, theme } = useWebSyntaxHighlighter("vscDarkPlus");
  const { CodeMirror, theme: editorTheme, languageExtension } = useWebCodeEditor(filepath);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const draft = filepath ? getEditorContent(fileContents, fileDrafts, filepath) : "";
  const dirty = filepath ? isFileDirty(fileContents, fileDrafts, filepath) : false;

  const handleChange = useCallback(
    (value: string) => {
      if (!filepath) return;
      setFileDraft(filepath, value);
      setSaveError(null);
    },
    [filepath, setFileDraft]
  );

  const handleRevert = useCallback(() => {
    if (!filepath) return;
    revertFileDraft(filepath);
    setSaveError(null);
  }, [filepath, revertFileDraft]);

  const handleSave = useCallback(async () => {
    if (!projectName || !filepath || !dirty) return;
    setSaving(true);
    setSaveError(null);
    try {
      await apiClient.saveProjectFile(projectName, filepath, draft);
      setFileContent(filepath, draft);
      clearFileDraft(filepath);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [
    projectName,
    filepath,
    dirty,
    draft,
    setFileContent,
    clearFileDraft,
  ]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSave]);

  if (!filepath && status === "generating") {
    return (
      <View className="flex-1" style={{ backgroundColor: "#0A0A0A", minHeight: 0 }}>
        <ScrollView style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ padding: 16 }}>
          <Text
            style={{
              color: "#00E5FF",
              fontFamily: "monospace",
              fontSize: 10,
              opacity: 0.5,
              marginBottom: 8,
            }}
          >
            Generating...
          </Text>
          <Text
            style={{
              color: "#00FF88",
              fontFamily: "monospace",
              fontSize: 12,
              opacity: 0.9,
              lineHeight: 20,
            }}
          >
            {streamingContent.length > 800
              ? streamingContent.slice(-800)
              : streamingContent}
          </Text>
        </ScrollView>
      </View>
    );
  }

  if (!filepath) {
    return (
      <View
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: "#0A0A0A" }}
      >
        <Text style={{ color: "#A0A8C0", fontSize: 12, opacity: 0.7 }}>
          Select a file to view
        </Text>
      </View>
    );
  }

  const hasContent = filepath in fileContents || filepath in fileDrafts;

  if (!hasContent) {
    return (
      <View
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: "#0A0A0A" }}
      >
        <Text style={{ color: "#A0A8C0", fontSize: 12, opacity: 0.7 }}>
          Loading {filepath}...
        </Text>
      </View>
    );
  }

  const toolbar = (
    <View
      className="flex-row items-center gap-2 px-3 py-2"
      style={{
        borderBottomWidth: 1,
        borderBottomColor: "rgba(255,255,255,0.06)",
        backgroundColor: "rgba(18,18,31,0.9)",
        zIndex: 2,
      }}
    >
      <Text
        className="flex-1 font-mono text-[10px]"
        style={{ color: dirty ? "#FFD700" : "#A0A8C0" }}
        numberOfLines={1}
      >
        {filepath}
        {dirty ? " • unsaved" : ""}
      </Text>
      <Pressable
        onPress={handleRevert}
        disabled={!dirty || saving}
        className="flex-row items-center gap-1 px-2 py-1 rounded-md"
        style={{
          opacity: dirty && !saving ? 1 : 0.4,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.1)",
        }}
      >
        <RotateCcw size={11} color="#A0A8C0" strokeWidth={2} />
        <Text style={{ fontSize: 10, color: "#A0A8C0", fontWeight: "600" }}>Revert</Text>
      </Pressable>
      <Pressable
        onPress={() => void handleSave()}
        disabled={!dirty || saving || !projectName}
        className="flex-row items-center gap-1 px-2.5 py-1 rounded-md"
        style={{
          backgroundColor: dirty && !saving ? "rgba(255, 215, 0, 0.2)" : "rgba(255,255,255,0.06)",
          borderWidth: 1,
          borderColor: dirty ? "rgba(255, 215, 0, 0.4)" : "rgba(255,255,255,0.08)",
          opacity: dirty && !saving && projectName ? 1 : 0.4,
        }}
      >
        {saving ? (
          <ActivityIndicator size="small" color="#FFD700" />
        ) : (
          <Save size={11} color="#FFD700" strokeWidth={2} />
        )}
        <Text style={{ fontSize: 10, color: "#FFD700", fontWeight: "700" }}>Save</Text>
      </Pressable>
    </View>
  );

  if (saveError) {
    return (
      <View className="flex-1" style={{ backgroundColor: "#0A0A0A" }}>
        {toolbar}
        <Text style={{ padding: 12, color: "#FF3366", fontSize: 11 }}>{saveError}</Text>
      </View>
    );
  }

  if (
    Platform.OS === "web" &&
    CodeMirror &&
    editorTheme &&
    languageExtension
  ) {
    return (
      <View className="flex-1" style={{ backgroundColor: "#0A0A0A", minHeight: 0 }}>
        {toolbar}
        <View className="flex-1" style={{ minHeight: 0 }}>
          <CodeMirror
            value={draft}
            height="100%"
            theme={editorTheme}
            extensions={[languageExtension]}
            onChange={handleChange}
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              highlightActiveLine: true,
            }}
          />
        </View>
      </View>
    );
  }

  if (Platform.OS !== "web") {
    return (
      <View className="flex-1" style={{ backgroundColor: "#0A0A0A", minHeight: 0 }}>
        {toolbar}
        <TextInput
          value={draft}
          onChangeText={handleChange}
          multiline
          style={{
            flex: 1,
            padding: 12,
            color: "#00FF88",
            fontFamily: "monospace",
            fontSize: 12,
            lineHeight: 18,
            textAlignVertical: "top",
          }}
        />
      </View>
    );
  }

  const lang = getLanguage(filepath);
  const lineCount = draft.split("\n").length;
  const canHighlight =
    SyntaxHighlighter !== null &&
    theme !== null &&
    draft.length < 80_000 &&
    lineCount < 1000;

  if (canHighlight) {
    return (
      <View className="flex-1" style={{ backgroundColor: "#0A0A0A", minHeight: 0 }}>
        {toolbar}
        <ScrollView style={{ flex: 1, minHeight: 0 }}>
          <SyntaxHighlighter
            language={lang}
            style={theme}
            showLineNumbers
            customStyle={{
              margin: 0,
              padding: 16,
              backgroundColor: "#09090B",
              fontSize: 13,
              lineHeight: 1.6,
              fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            }}
          >
            {draft}
          </SyntaxHighlighter>
        </ScrollView>
      </View>
    );
  }

  const lines = draft.split("\n");
  return (
    <View className="flex-1" style={{ backgroundColor: "#0A0A0A", minHeight: 0 }}>
      {toolbar}
      <ScrollView style={{ flex: 1, minHeight: 0 }} horizontal>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {lines.map((line, i) => (
            <View key={i} className="flex-row" style={{ minHeight: 20 }}>
              <Text
                className="font-mono text-xs text-right"
                style={mixedStyle({
                  width: 40,
                  paddingRight: 16,
                  color: "#00FF88",
                  opacity: 0.3,
                })}
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
