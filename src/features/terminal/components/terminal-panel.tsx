import { useRef, useEffect } from "react";
import { View, Text, ScrollView } from "react-native";
import { Terminal } from "lucide-react-native";
import { useProjectStore } from "@/stores/project-store";
import { mixedStyle } from "@/shared/lib/web-styles";

const TerminalPanel = () => {
  const scrollRef = useRef<ScrollView>(null);
  const streamingContent = useProjectStore((s) => s.streamingContent);
  const generationProgress = useProjectStore((s) => s.generationProgress);
  const currentFile = useProjectStore((s) => s.currentGeneratingFile);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: false });
  }, [streamingContent]);

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
            Terminal
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

      <ScrollView ref={scrollRef} style={{ height: 120 }} contentContainerStyle={{ padding: 12 }}>
        {streamingContent ? (
          <Text style={{ color: "#00E5FF", fontFamily: "monospace", fontSize: 11, lineHeight: 18 }}>
            {streamingContent.split("\n").map((line, i) => {
              const lower = line.toLowerCase();
              const isError = (lower.includes("error:") || lower.includes("error ") || lower.startsWith("error")) && !lower.includes("0 error");
              const isRag = line.includes("🧠 RAG");
              const isHealing = line.includes("🔄 Auto-Healing");
              const isMoe = line.includes("[MoE]");
              const isRetryOk = lower.includes("retry") && lower.includes("ok");
              const lineColor = isError ? "#FF3366" : isMoe ? "#FFD700" : isRag ? "#B388FF" : isHealing ? "#00FF88" : isRetryOk ? "#00E5FF" : undefined;
              return (
                <Text key={i} style={{ color: lineColor, fontWeight: isRag || isHealing || isMoe ? "700" : undefined }}>
                  {line}{"\n"}
                </Text>
              );
            })}
          </Text>
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
