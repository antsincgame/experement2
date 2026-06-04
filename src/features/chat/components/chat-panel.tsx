import { useRef, useEffect, useCallback } from "react";
import { View, Text, ScrollView, ActivityIndicator } from "react-native";
import { MessageSquare } from "lucide-react-native";
import { GENERATION_STATUS_LABELS } from "@/shared/lib/generation-status";
import { useProjectGeneration } from "@/features/workspace/hooks/use-project-generation";
import { useProjectStore } from "@/stores/project-store";
import ChatMessage from "./chat-message";
import ChatInput from "./chat-input";
import GenerationActivity from "./generation-activity";
import { GenerationControls } from "./generation-controls";

interface ChatPanelProps {
  onSend: (text: string) => void;
  onAbort: () => void;
}

const ChatPanel = ({ onSend, onAbort }: ChatPanelProps) => {
  const scrollRef = useRef<ScrollView>(null);
  const messages = useProjectStore((s) => s.messages);
  const status = useProjectStore((s) => s.status);
  const generationFiles = useProjectStore((s) => s.generationFiles);
  const projectName = useProjectStore((s) => s.projectName);
  const {
    handleResumeGeneration,
    isResuming,
    pipelineBusy,
    resumeStatus,
    showContinue,
  } = useProjectGeneration(projectName);

  const isGenerating = pipelineBusy;
  const visibleMessages = messages.filter((m) => !m.isHidden);
  const hasActivity = isGenerating || generationFiles.length > 0;
  const streamingFile = generationFiles.find((f) => f.status === "streaming");
  const activitySignature = streamingFile
    ? `${streamingFile.path}:${streamingFile.code.length}`
    : `${status}:${generationFiles.length}`;
  const lastVisibleMessage = visibleMessages.at(-1);
  const lastVisibleSignature = lastVisibleMessage
    ? `${lastVisibleMessage.id}:${lastVisibleMessage.content.length}:${lastVisibleMessage.status}`
    : "none";

  // Auto-scroll on new messages AND live generation output.
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 50);
    return () => clearTimeout(timer);
  }, [lastVisibleSignature, activitySignature]);

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
    <View className="flex-1" style={{ backgroundColor: "rgba(18,18,31,0.6)" }}>
      {/* Header */}
      <View
        className="h-10 px-4 flex-row items-center justify-between"
        style={{ borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" }}
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
            <Text style={{ fontSize: 9, color: "#00E5FF", fontWeight: "600" }}>
              {GENERATION_STATUS_LABELS[status] ?? status}
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
        {visibleMessages.length === 0 && !hasActivity && (
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

        {/* Live "watch it build" panel — phases + per-file streaming code */}
        <GenerationActivity />
      </ScrollView>

      <GenerationControls
        showAbort={pipelineBusy}
        showContinue={showContinue}
        isResuming={isResuming}
        missingFileCount={resumeStatus?.missingFileCount ?? undefined}
        onAbort={onAbort}
        onContinue={handleResumeGeneration}
      />
      <ChatInput onSend={onSend} onAbort={onAbort} isGenerating={isGenerating} />
    </View>
  );
};

export default ChatPanel;
