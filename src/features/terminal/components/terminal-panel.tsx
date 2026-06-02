// Terminal under the code view: shows a code-free, human-readable activity log (phase + per-file
// meaning). Raw code never appears here — it lives only in the code generator (CodeViewer).
import { useRef, useEffect } from "react";
import { View, Text, ScrollView } from "react-native";
import { Terminal } from "lucide-react-native";
import { useProjectStore } from "@/stores/project-store";
import { mixedStyle } from "@/shared/lib/web-styles";
import { buildTerminalLines, type TerminalLineTone } from "@/shared/lib/generation-narration";

const TONE_COLOR: Record<TerminalLineTone, string> = {
  phase: "#FFD700",
  active: "#00E5FF",
  done: "#00FF88",
  muted: "#7C84A8",
};

const TerminalPanel = () => {
  const scrollRef = useRef<ScrollView>(null);
  const status = useProjectStore((s) => s.status);
  const files = useProjectStore((s) => s.generationFiles);
  const plan = useProjectStore((s) => s.plan);
  const generationProgress = useProjectStore((s) => s.generationProgress);
  const currentFile = useProjectStore((s) => s.currentGeneratingFile);

  const lines = buildTerminalLines(status, files, plan);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: false });
  }, [lines.length]);

  return (
    <View style={{
      backgroundColor: "rgba(11, 13, 23, 0.95)",
      borderTopWidth: 1,
      borderTopColor: "rgba(0, 229, 255, 0.15)",
    }}>
      <View className="h-8 px-3 flex-row items-center justify-between"
        style={{ borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" }}
      >
        <View className="flex-row items-center gap-2">
          <Terminal size={11} color="#00E5FF" strokeWidth={1.5} />
          <Text style={{ color: "#00E5FF", fontSize: 9, letterSpacing: 2, fontWeight: "600", textTransform: "uppercase" }}>
            Activity
          </Text>
        </View>
        {currentFile && (
          <Text style={{ color: "#00E5FF", fontSize: 10, fontFamily: "monospace", opacity: 0.7 }}>
            {currentFile} {generationProgress > 0 ? `(${Math.round(generationProgress * 100)}%)` : ""}
          </Text>
        )}
      </View>

      {generationProgress > 0 && generationProgress < 1 && (
        <View style={{ height: 2, backgroundColor: "rgba(0,229,255,0.1)" }}>
          <View
            style={mixedStyle({
              height: "100%",
              width: `${generationProgress * 100}%`,
              background: "linear-gradient(90deg, #00E5FF, #7C4DFF)",
              backgroundColor: "#00E5FF",
            })}
          />
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        style={mixedStyle({ height: 120, overflow: "auto", flexShrink: 0 })}
        contentContainerStyle={{ padding: 12 }}
        nestedScrollEnabled
      >
        {lines.length > 0 ? (
          lines.map((line) => (
            <Text
              key={line.key}
              style={{
                color: TONE_COLOR[line.tone],
                fontFamily: "monospace",
                fontSize: 11,
                lineHeight: 18,
                fontWeight: line.tone === "phase" ? "700" : "400",
              }}
            >
              {line.text}
            </Text>
          ))
        ) : (
          <Text style={{ color: "#4A4A6A", fontFamily: "monospace", fontSize: 11 }}>
            $ awaiting commands...
          </Text>
        )}
      </ScrollView>
    </View>
  );
};

export default TerminalPanel;
