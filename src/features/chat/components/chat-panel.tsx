import { useRef, useEffect, useCallback } from "react";
import { View, Text, ScrollView, ActivityIndicator } from "react-native";
import { MessageSquare, Bot, Cpu, FileCode } from "lucide-react-native";
import { useProjectStore } from "@/stores/project-store";
import ChatMessage from "./chat-message";
import ChatInput from "./chat-input";
import MarkdownRenderer from "./markdown-renderer";

interface ChatPanelProps {
  onSend: (text: string) => void;
  onAbort: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  planning: "Planning app architecture...",
  scaffolding: "Scaffolding project...",
  generating: "Generating code...",
  building: "Building with Metro...",
  analyzing: "Analyzing codebase...",
  validating: "Running quality checks...",
};

const ChatPanel = ({ onSend, onAbort }: ChatPanelProps) => {
  const scrollRef = useRef<ScrollView>(null);
  const messages = useProjectStore((s) => s.messages);
  const status = useProjectStore((s) => s.status);
  const streamingContent = useProjectStore((s) => s.streamingContent);
  const generationProgress = useProjectStore((s) => s.generationProgress);
  const currentFile = useProjectStore((s) => s.currentGeneratingFile);

  const isGenerating = !["idle", "ready", "error"].includes(status);
  const visibleMessages = messages.filter((m) => !m.isHidden);
  const hasStreaming = isGenerating && (streamingContent || currentFile);

  // Auto-scroll on new messages AND streaming content
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 50);
    return () => clearTimeout(timer);
  }, [visibleMessages.length, hasStreaming, currentFile]);

  const handleFixError = useCallback(
    (errorContent: string, errorDetails?: string, errorFile?: string) => {
      const parts: string[] = ["Fix the following error:"];
      if (errorFile) parts.push(`File: ${errorFile}`);
      parts.push(`Error: ${errorContent}`);
      if (errorDetails) parts.push(`Details: ${errorDetails}`);
      parts.push("Analyze the error and apply the fix.");
      onSend(parts.join("\n"));
    },
    [onSend],
  );

  return (
    <View className="flex-1" style={{ backgroundColor: "rgba(255,255,255,0.4)" }}>
      {/* Header */}
      <View
        className="h-10 px-4 flex-row items-center justify-between"
        style={{ borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.06)" }}
      >
        <View className="flex-row items-center">
          <MessageSquare size={13} color="#7C4DFF" strokeWidth={1.5} />
          <Text className="text-ink-muted text-[10px] uppercase tracking-widest ml-2 font-semibold">
            Chat
          </Text>
        </View>
        {isGenerating && (
          <View className="flex-row items-center gap-1.5">
            <ActivityIndicator size={10} color="#00E5FF" />
            <Text style={{ fontSize: 9, color: "#00BCD4", fontWeight: "600" }}>
              {STATUS_LABELS[status] ?? status}
            </Text>
          </View>
        )}
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 8 }}
      >
        {visibleMessages.length === 0 && !hasStreaming && (
          <View className="items-center justify-center py-20 px-6">
            <View
              className="w-12 h-12 rounded-2xl items-center justify-center mb-3"
              style={{ backgroundColor: "rgba(124, 77, 255, 0.1)" }}
            >
              <MessageSquare size={20} color="#7C4DFF" strokeWidth={1.5} />
            </View>
            <Text className="text-ink-muted text-xs text-center leading-5">
              Describe changes to your app.{"\n"}
              AI will edit the code in real-time.
            </Text>
          </View>
        )}

        {visibleMessages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} onFixError={handleFixError} />
        ))}

        {/* Streaming bubble — live AI output */}
        {hasStreaming && (
          <View className="px-4 py-3 animate-fade-in">
            {/* AI header */}
            <View className="flex-row items-center gap-2 mb-1.5">
              <View
                className="w-6 h-6 rounded-lg items-center justify-center"
                style={{
                  backgroundColor: "rgba(0, 229, 255, 0.1)",
                  borderWidth: 1,
                  borderColor: "rgba(0, 229, 255, 0.2)",
                }}
              >
                <Cpu size={12} color="#00E5FF" strokeWidth={1.5} />
              </View>
              <Text className="text-xs font-semibold" style={{ color: "#00BCD4" }}>
                AI Working
              </Text>
              <ActivityIndicator size={10} color="#00E5FF" />
            </View>

            {/* Progress bar */}
            {generationProgress > 0 && generationProgress < 1 && (
              <View className="ml-8 mb-2">
                <View className="flex-row items-center gap-2 mb-1">
                  {currentFile && (
                    <View className="flex-row items-center gap-1 flex-1">
                      <FileCode size={10} color="#7C4DFF" strokeWidth={1.5} />
                      <Text style={{ fontSize: 10, color: "#7C4DFF", fontFamily: "monospace" }} numberOfLines={1}>
                        {currentFile}
                      </Text>
                    </View>
                  )}
                  <Text style={{ fontSize: 9, color: "#888", fontWeight: "600" }}>
                    {Math.round(generationProgress * 100)}%
                  </Text>
                </View>
                <View
                  className="rounded-full overflow-hidden"
                  style={{ height: 3, backgroundColor: "rgba(0,0,0,0.06)" }}
                >
                  <View
                    style={{
                      height: "100%",
                      width: `${generationProgress * 100}%`,
                      backgroundColor: "#00E5FF",
                      borderRadius: 999,
                    }}
                  />
                </View>
              </View>
            )}

            {/* Streaming text content */}
            {streamingContent ? (
              <View className="ml-8">
                <MarkdownRenderer content={streamingContent.slice(-2000)} />
              </View>
            ) : currentFile ? (
              <View className="ml-8">
                <Text style={{ fontSize: 12, color: "#888", fontStyle: "italic" }}>
                  Processing {currentFile}...
                </Text>
              </View>
            ) : (
              <View className="ml-8">
                <Text style={{ fontSize: 12, color: "#888", fontStyle: "italic" }}>
                  {STATUS_LABELS[status] ?? "Working..."}
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <ChatInput onSend={onSend} onAbort={onAbort} isGenerating={isGenerating} />
    </View>
  );
};

export default ChatPanel;
