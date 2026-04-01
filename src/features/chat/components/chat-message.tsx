import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import {
  User, Bot, ChevronDown, ChevronRight, Loader,
  AlertTriangle, Wrench, Copy, ChevronUp,
} from "lucide-react-native";
import type { ChatMessage as Msg } from "../schemas/message.schema";
import MarkdownRenderer from "./markdown-renderer";

interface ChatMessageProps {
  message: Msg;
  onFixError?: (errorContent: string, errorDetails?: string, errorFile?: string) => void;
}

const ChatMessage = ({ message, onFixError }: ChatMessageProps) => {
  const [thinkingOpen, setThinkingOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

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
  const isError = message.isError || isErrorContent(message.content);

  if (isError && !isUser) {
    return (
      <View className="px-4 py-3 animate-slide-up">
        {/* Error header */}
        <View
          className="rounded-xl overflow-hidden"
          style={{
            backgroundColor: "rgba(255, 51, 102, 0.06)",
            borderWidth: 1,
            borderColor: "rgba(255, 51, 102, 0.2)",
          }}
        >
          <View className="px-3 py-2.5 flex-row items-center gap-2">
            <View
              className="w-6 h-6 rounded-lg items-center justify-center"
              style={{
                backgroundColor: "rgba(255, 51, 102, 0.15)",
                borderWidth: 1,
                borderColor: "rgba(255, 51, 102, 0.3)",
              }}
            >
              <AlertTriangle size={12} color="#FF3366" strokeWidth={2} />
            </View>
            <Text className="text-xs font-semibold" style={{ color: "#FF3366" }}>
              Error
            </Text>
            {message.errorFile && (
              <Text className="text-xs" style={{ color: "#FF6B8A", opacity: 0.7 }}>
                in {message.errorFile}
              </Text>
            )}
          </View>

          {/* Error content */}
          <View className="px-3 pb-2">
            <Text
              className="text-sm leading-5"
              style={{ color: "#FFB3C5" }}
            >
              {message.content}
            </Text>
          </View>

          {/* Error details expandable */}
          {message.errorDetails && (
            <View>
              <Pressable
                onPress={() => setDetailsOpen(!detailsOpen)}
                className="px-3 py-1.5 flex-row items-center gap-1"
                style={{ borderTopWidth: 1, borderTopColor: "rgba(255, 51, 102, 0.1)" }}
              >
                {detailsOpen ? (
                  <ChevronUp size={12} color="#FF6B8A" />
                ) : (
                  <ChevronDown size={12} color="#FF6B8A" />
                )}
                <Text style={{ color: "#FF6B8A", fontSize: 10, fontWeight: "500" }}>
                  Details
                </Text>
              </Pressable>
              {detailsOpen && (
                <View
                  className="mx-3 mb-2 p-2 rounded-lg"
                  style={{ backgroundColor: "rgba(0, 0, 0, 0.2)" }}
                >
                  <Text
                    style={{
                      color: "#FF8DA6",
                      fontSize: 11,
                      fontFamily: "monospace",
                      lineHeight: 16,
                    }}
                  >
                    {message.errorDetails}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Action buttons */}
          <View
            className="flex-row gap-2 px-3 py-2.5"
            style={{ borderTopWidth: 1, borderTopColor: "rgba(255, 51, 102, 0.1)" }}
          >
            <Pressable
              onPress={() => onFixError?.(
                message.content,
                message.errorDetails,
                message.errorFile,
              )}
              className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg"
              style={{
                backgroundColor: "rgba(0, 229, 255, 0.1)",
                borderWidth: 1,
                borderColor: "rgba(0, 229, 255, 0.25)",
              }}
            >
              <Wrench size={12} color="#00E5FF" strokeWidth={2} />
              <Text style={{ color: "#00E5FF", fontSize: 11, fontWeight: "600" }}>
                Fix Error
              </Text>
            </Pressable>

            <Pressable
              onPress={() => copyToClipboard(message.errorDetails || message.content)}
              className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg"
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.05)",
                borderWidth: 1,
                borderColor: "rgba(255, 255, 255, 0.1)",
              }}
            >
              <Copy size={12} color="#888" strokeWidth={2} />
              <Text style={{ color: "#888", fontSize: 11, fontWeight: "500" }}>
                Copy
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

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
        {isUser ? (
          <Text className="text-sm leading-6 text-ink-dark font-medium">
            {message.content}
          </Text>
        ) : (
          <MarkdownRenderer content={message.content} />
        )}
      </View>
    </View>
  );
};

const isErrorContent = (content: string): boolean => {
  const lower = content.toLowerCase();
  return (
    lower.startsWith("error:") ||
    lower.includes("could not fix") ||
    lower.includes("failed to") ||
    (lower.includes("error") && lower.includes("attempt"))
  );
};

const copyToClipboard = (text: string): void => {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
};

export default ChatMessage;
