// Collapsible before/after diff for AI file edits; CodeMirror merge on web, line fallback on native.
import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, Platform } from "react-native";
import { ChevronDown, ChevronRight, FileCode2 } from "lucide-react-native";
import { editorLanguageFromPath } from "@/shared/hooks/use-web-code-editor";

interface DiffViewProps {
  filepath: string;
  before: string;
  after: string;
}

const MAX_DIFF_LINES = 120;

const tailForDisplay = (text: string): string => {
  const lines = text.split("\n");
  if (lines.length <= MAX_DIFF_LINES) {
    return text;
  }
  return `… (${lines.length - MAX_DIFF_LINES} lines above)\n${lines.slice(-MAX_DIFF_LINES).join("\n")}`;
};

const SimpleLineDiff = ({ before, after }: { before: string; after: string }) => {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const max = Math.max(beforeLines.length, afterLines.length);

  return (
    <ScrollView horizontal className="max-h-64">
      <View style={{ padding: 8, minWidth: 280 }}>
        {Array.from({ length: Math.min(max, MAX_DIFF_LINES) }, (_, i) => {
          const oldLine = beforeLines[i];
          const newLine = afterLines[i];
          const removed = oldLine !== undefined && oldLine !== newLine;
          const added = newLine !== undefined && oldLine !== newLine;
          if (!removed && !added && oldLine === newLine) {
            return (
              <Text
                key={i}
                style={{ fontFamily: "monospace", fontSize: 10, color: "#5A5A72", lineHeight: 16 }}
              >
                {`  ${newLine ?? ""}`}
              </Text>
            );
          }
          return (
            <View key={i}>
              {removed && oldLine !== undefined && (
                <Text
                  style={{
                    fontFamily: "monospace",
                    fontSize: 10,
                    color: "#FF6B8A",
                    lineHeight: 16,
                    backgroundColor: "rgba(255,51,102,0.08)",
                  }}
                >
                  {`- ${oldLine}`}
                </Text>
              )}
              {added && newLine !== undefined && (
                <Text
                  style={{
                    fontFamily: "monospace",
                    fontSize: 10,
                    color: "#00FF88",
                    lineHeight: 16,
                    backgroundColor: "rgba(0,255,136,0.06)",
                  }}
                >
                  {`+ ${newLine}`}
                </Text>
              )}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
};

const MergeDiffPanel = ({
  filepath,
  before,
  after,
}: DiffViewProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [mergeFailed, setMergeFailed] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web" || !containerRef.current || mergeFailed) {
      return;
    }

    let view: { destroy: () => void } | null = null;
    let cancelled = false;

    const mount = async (): Promise<void> => {
      try {
        const [{ MergeView }, { javascript }, { oneDark }] = await Promise.all([
          import("@codemirror/merge"),
          import("@codemirror/lang-javascript"),
          import("@codemirror/theme-one-dark"),
        ]);
        if (cancelled || !containerRef.current) {
          return;
        }
        const lang = editorLanguageFromPath(filepath);
        const ext = javascript({
          typescript: lang === "typescript" || lang === "tsx",
          jsx: lang === "jsx" || lang === "tsx",
        });
        view = new MergeView({
          a: {
            doc: tailForDisplay(before),
            extensions: [ext, oneDark],
          },
          b: {
            doc: tailForDisplay(after),
            extensions: [ext, oneDark],
          },
          parent: containerRef.current,
          collapseUnchanged: { margin: 3 },
        });
      } catch {
        if (!cancelled) {
          setMergeFailed(true);
        }
      }
    };

    void mount();

    return () => {
      cancelled = true;
      view?.destroy();
    };
  }, [filepath, before, after, mergeFailed]);

  if (mergeFailed) {
    return <SimpleLineDiff before={before} after={after} />;
  }

  return (
    <div
      ref={containerRef}
      style={{
        maxHeight: 280,
        overflow: "auto",
        fontSize: 11,
        borderRadius: 8,
      }}
    />
  );
};

const DiffView = ({ filepath, before, after }: DiffViewProps) => {
  const [open, setOpen] = useState(true);
  const addedLines = after.split("\n").length - before.split("\n").length;
  const sign = addedLines >= 0 ? "+" : "";

  return (
    <View
      className="mx-4 mb-2 rounded-xl overflow-hidden"
      style={{
        borderWidth: 1,
        borderColor: "rgba(124, 77, 255, 0.25)",
        backgroundColor: "rgba(124, 77, 255, 0.05)",
      }}
    >
      <Pressable
        onPress={() => setOpen(!open)}
        className="flex-row items-center gap-2 px-3 py-2"
      >
        {open ? (
          <ChevronDown size={13} color="#7C4DFF" strokeWidth={2} />
        ) : (
          <ChevronRight size={13} color="#7C4DFF" strokeWidth={2} />
        )}
        <FileCode2 size={13} color="#7C4DFF" strokeWidth={1.75} />
        <Text
          style={{ flex: 1, fontSize: 12, color: "#D8D8EC", fontFamily: "monospace" }}
          numberOfLines={1}
        >
          {filepath}
        </Text>
        <Text style={{ fontSize: 10, color: "#A0A8C0", fontWeight: "600" }}>
          {sign}
          {addedLines} lines
        </Text>
      </Pressable>
      {open && (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: "rgba(255,255,255,0.06)",
            backgroundColor: "rgba(0,0,0,0.2)",
          }}
        >
          {Platform.OS === "web" ? (
            <MergeDiffPanel filepath={filepath} before={before} after={after} />
          ) : (
            <SimpleLineDiff before={before} after={after} />
          )}
        </View>
      )}
    </View>
  );
};

export default DiffView;
