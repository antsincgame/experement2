import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import {
  User, Bot, ChevronDown, ChevronRight, Loader,
  AlertTriangle, Wrench, Copy, ChevronUp,
} from "lucide-react-native";
import type { ChatMessage as Msg } from "../schemas/message.schema";
import MarkdownRenderer from "./markdown-renderer";
import DiffView from "./diff-view";
import ProcessMessage from "./process-message";

interface ChatMessageProps {
  message: Msg;
  onFixError?: (errorContent: string, errorDetails?: string, errorFile?: string) => void;
}

const ChatMessage = ({ message, onFixError }: ChatMessageProps) => {
  const isReasoningOnly = message.content.trim() === "" && !!message.thinking;
  const [thinkingOpen, setThinkingOpen] = useState(isReasoningOnly);
  const [detailsOpen, setDetailsOpen] = useState(false);

  if (message.isHidden) return null;

  if (message.role === "system") {
    if (message.diffFilepath && message.diffBefore !== undefined && message.diffAfter !== undefined) {
      return (
        <View className="py-1 animate-fade-in">
          <DiffView
            filepath={message.diffFilepath}
            before={message.diffBefore}
            after={message.diffAfter}
          />
        </View>
      );
    }
    return (
      <View className="px-4 py-1.5 animate-fade-in">
        <Text className="text-ink-light text-xs">{message.content}</Text>
      </View>
    );
  }

  if (message.processKind) {
    return <ProcessMessage message={message} />;
  }

  const isUser = message.role === "user";
  const isStreaming = message.status === "streaming";
  const isError = message.isError === true;
  // Actionable = points at a real source file the editor can open and fix.
  const errorBlob = `${message.content}\n${message.errorDetails ?? ""}`;
  const isQueueTimeout = /operation create_project timed out|timed out after 600s/i.test(
    errorBlob,
  );
  const isSelfHealingBuildNoise =
    /could not fix after|metro build timed out|autofix skipped: error has no editable source/i.test(
      errorBlob,
    ) || isQueueTimeout;
  const isPreviewBlocked =
    /preview failed to start|cannot read properties of undefined.*undetermined|expo-contacts/i.test(
      errorBlob,
    );
  const isIterateOrEditorFailure =
    /unrecoverable json|plan validation failed|applied 0 changes/i.test(errorBlob);
  const isActionableError =
    (typeof message.errorFile === "string" && message.errorFile.trim().length > 0) ||
    (message.isError === true && isIterateOrEditorFailure) ||
    (message.isError === true && isPreviewBlocked) ||
    (message.isError === true && !isSelfHealingBuildNoise && errorBlob.trim().length > 0);

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

          {/* Action buttons. The "Fix" button only appears for actionable errors —
              ones that point at a real source file. Non-actionable failures
              (timeouts, "could not fix", preview failures) self-heal during build
              and offer no button, so it is never unclear when Fix will help. */}
          <View
            className="flex-row items-center gap-2 px-3 py-2.5"
            style={{ borderTopWidth: 1, borderTopColor: "rgba(255, 51, 102, 0.1)" }}
          >
            {isActionableError ? (
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
                  Fix this file
                </Text>
              </Pressable>
            ) : isQueueTimeout ? (
              <Text style={{ color: "#8888AA", fontSize: 10, fontStyle: "italic" }}>
                Queue limit (10 min) — not a code bug. Generation may still be running; check
                preview and file list, or wait and refresh.
              </Text>
            ) : isIterateOrEditorFailure ? (
              <Text style={{ color: "#8888AA", fontSize: 10, fontStyle: "italic" }}>
                Describe the fix in chat — the agent will retry iteration.
              </Text>
            ) : (
              <Text style={{ color: "#8888AA", fontSize: 10, fontStyle: "italic" }}>
                Auto-recovered during build — no action needed.
              </Text>
            )}

            <Pressable
              onPress={() => copyToClipboard(message.errorDetails || message.content)}
              className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg"
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.05)",
                borderWidth: 1,
                borderColor: "rgba(255, 255, 255, 0.1)",
              }}
            >
              <Copy size={12} color="#8888AA" strokeWidth={2} />
              <Text style={{ color: "#8888AA", fontSize: 11, fontWeight: "500" }}>
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
          <Text className="text-neon-violet text-xs italic">
            {isReasoningOnly ? "Reasoning" : "Thinking..."}
          </Text>
        </Pressable>
      )}
      {message.thinking && thinkingOpen && (
        <View className="ml-8 mb-2 pl-3" style={{ borderLeftWidth: 2, borderLeftColor: "rgba(124, 77, 255, 0.3)" }}>
          <Text className="text-ink-light text-xs italic leading-5">
            {message.thinking}
          </Text>
        </View>
      )}

      {message.content.trim() !== "" && (
        <View className="ml-8">
          {isUser ? (
            <Text className="text-sm leading-6 text-white font-medium">
              {message.content}
            </Text>
          ) : (
            <MarkdownRenderer content={message.content} />
          )}
        </View>
      )}
    </View>
  );
};

const copyToClipboard = (text: string): void => {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
};

export default ChatMessage;
