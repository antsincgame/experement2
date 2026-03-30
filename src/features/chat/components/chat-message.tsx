import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { User, Bot, ChevronDown, ChevronRight, Loader } from "lucide-react-native";
import type { ChatMessage as Msg } from "../schemas/message.schema";

interface ChatMessageProps {
  message: Msg;
}

const ChatMessage = ({ message }: ChatMessageProps) => {
  const [thinkingOpen, setThinkingOpen] = useState(false);

  if (message.isHidden) return null;

  if (message.role === "system") {
    return (
      <View className="px-4 py-1.5 animate-fade-in">
        <Text className="text-ink-light text-xs">{message.content}</Text>
      </View>
    );
  }

  const isUser = message.role === "user";
  const isStreaming = message.status === "streaming";

  return (
    <View className="px-4 py-3 animate-slide-up">
      <View className="flex-row items-center gap-2 mb-1.5">
        <View
          className={`w-6 h-6 rounded-lg items-center justify-center ${
            isUser ? "bg-neon-cyan-bg" : "bg-neon-violet-bg"
          }`}
          style={{
            borderWidth: 1,
            borderColor: isUser
              ? "rgba(0, 229, 255, 0.3)"
              : "rgba(124, 77, 255, 0.3)",
          }}
        >
          {isUser ? (
            <User size={12} color="#00E5FF" strokeWidth={1.5} />
          ) : (
            <Bot size={12} color="#7C4DFF" strokeWidth={1.5} />
          )}
        </View>
        <Text className="text-ink-muted text-xs font-semibold">
          {isUser ? "You" : "AI"}
        </Text>
        {isStreaming && (
          <Loader size={10} color="#00E5FF" strokeWidth={2} />
        )}
      </View>

      {message.thinking && (
        <Pressable
          onPress={() => setThinkingOpen(!thinkingOpen)}
          className="flex-row items-center gap-1.5 mb-2 ml-8"
        >
          {thinkingOpen ? (
            <ChevronDown size={12} color="#7C4DFF" strokeWidth={1.5} />
          ) : (
            <ChevronRight size={12} color="#7C4DFF" strokeWidth={1.5} />
          )}
          <Text className="text-neon-violet text-xs italic">Thinking...</Text>
        </Pressable>
      )}
      {message.thinking && thinkingOpen && (
        <View className="ml-8 mb-2 pl-3" style={{ borderLeftWidth: 2, borderLeftColor: "rgba(124, 77, 255, 0.3)" }}>
          <Text className="text-ink-light text-xs italic leading-5">
            {message.thinking}
          </Text>
        </View>
      )}

      <View className="ml-8">
        <Text
          className={`text-sm leading-6 ${
            isUser ? "text-ink-dark font-medium" : "text-ink-base"
          }`}
        >
          {message.content}
        </Text>
      </View>
    </View>
  );
};

export default ChatMessage;
