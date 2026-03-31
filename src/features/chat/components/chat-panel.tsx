import { useRef, useEffect, useCallback } from "react";
import { View, Text, ScrollView } from "react-native";
import { MessageSquare } from "lucide-react-native";
import { useProjectStore } from "@/stores/project-store";
import ChatMessage from "./chat-message";
import ChatInput from "./chat-input";

interface ChatPanelProps {
  onSend: (text: string) => void;
  onAbort: () => void;
}

const ChatPanel = ({ onSend, onAbort }: ChatPanelProps) => {
  const scrollRef = useRef<ScrollView>(null);
  const messages = useProjectStore((s) => s.messages);
  const status = useProjectStore((s) => s.status);

  const isGenerating = !["idle", "ready", "error"].includes(status);
  const visibleMessages = messages.filter((m) => !m.isHidden);

  useEffect(() => {
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 50);
    return () => clearTimeout(timer);
  }, [visibleMessages.length]);

  const handleFixError = useCallback(
    (errorContent: string, errorDetails?: string, errorFile?: string) => {
      const parts: string[] = ["Fix the following error:"];

      if (errorFile) {
        parts.push(`File: ${errorFile}`);
      }

      parts.push(`Error: ${errorContent}`);

      if (errorDetails) {
        parts.push(`Details: ${errorDetails}`);
      }

      parts.push("Analyze the error and apply the fix.");

      onSend(parts.join("\n"));
    },
    [onSend],
  );

  return (
    <View className="flex-1" style={{ backgroundColor: "rgba(255,255,255,0.4)" }}>
      <View
        className="h-10 px-4 flex-row items-center"
        style={{ borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.06)" }}
      >
        <MessageSquare size={13} color="#7C4DFF" strokeWidth={1.5} />
        <Text className="text-ink-muted text-[10px] uppercase tracking-widest ml-2 font-semibold">
          Chat
        </Text>
      </View>

      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 8 }}
      >
        {visibleMessages.length === 0 && (
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
      </ScrollView>

      <ChatInput onSend={onSend} onAbort={onAbort} isGenerating={isGenerating} />
    </View>
  );
};

export default ChatPanel;
