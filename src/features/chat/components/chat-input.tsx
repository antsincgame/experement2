// Uses the shared API client and a stable keydown listener to avoid per-keystroke subscriptions.
import { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  TextInput,
  Pressable,
  Text,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SendHorizontal, Square, Sparkles } from "lucide-react-native";
import { apiClient } from "@/shared/lib/api-client";
import { useSettingsStore } from "@/stores/settings-store";

interface ChatInputProps {
  onSend: (text: string) => void;
  onAbort?: () => void;
  isGenerating?: boolean;
  placeholder?: string;
}

const ChatInput = ({
  onSend,
  onAbort,
  isGenerating = false,
  placeholder = "Describe changes...",
}: ChatInputProps) => {
  const [text, setText] = useState("");
  const [enhancing, setEnhancing] = useState(false);
  const handleSendRef = useRef<() => void>(() => undefined);
  const enhancerEnabled = useSettingsStore((state) => state.enhancerEnabled);
  const enhancerModel = useSettingsStore((state) => state.enhancerModel);
  const lmStudioUrl = useSettingsStore((state) => state.lmStudioUrl);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    onSend(trimmed);
    setText("");
  }, [onSend, text]);

  useEffect(() => {
    handleSendRef.current = handleSend;
  }, [handleSend]);

  const handleEnhance = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    setEnhancing(true);
    try {
      const improvedPrompt = await apiClient.enhancePrompt({
        prompt: trimmed,
        model: enhancerModel || undefined,
        lmStudioUrl,
      });

      if (improvedPrompt) {
        setText(improvedPrompt);
      }
    } catch (error) {
      console.warn("[chat-input] Prompt enhancement failed", error);
    } finally {
      setEnhancing(false);
    }
  }, [enhancerModel, lmStudioUrl, text]);

  useEffect(() => {
    if (Platform.OS !== "web") {
      return;
    }

    const handler = (event: KeyboardEvent) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        handleSendRef.current();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const hasText = text.trim().length > 0;

  return (
    <View
      className="px-3 py-3"
      style={{ borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.06)" }}
    >
      <View
        className="flex-row items-end rounded-xl overflow-hidden"
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.7)",
          borderWidth: 1,
          borderColor: "rgba(0, 229, 255, 0.2)",
        }}
      >
        <TextInput
          accessibilityLabel="Chat message input"
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor="#8888AA"
          multiline
          className="flex-1 text-ink-dark text-sm px-4 py-3 max-h-32"
          style={{ fontFamily: "Inter, system-ui, sans-serif", outlineStyle: "none" } as never}
        />

        <View className="flex-row items-center m-1.5 gap-1">
          {enhancerEnabled && hasText && !isGenerating && (
            <Pressable
              accessibilityLabel="Improve chat prompt"
              accessibilityRole="button"
              onPress={handleEnhance}
              disabled={enhancing}
              className="w-8 h-8 rounded-lg items-center justify-center"
              style={{ backgroundColor: "rgba(124, 77, 255, 0.12)" }}
            >
              {enhancing ? (
                <ActivityIndicator size="small" color="#7C4DFF" />
              ) : (
                <Sparkles size={14} color="#7C4DFF" strokeWidth={1.5} />
              )}
            </Pressable>
          )}

          {isGenerating ? (
            <Pressable
              accessibilityLabel="Stop generation"
              accessibilityRole="button"
              onPress={onAbort}
              className="w-8 h-8 rounded-lg items-center justify-center"
              style={{ backgroundColor: "rgba(255, 51, 102, 0.15)" }}
            >
              <Square size={14} color="#FF3366" strokeWidth={1.5} fill="#FF3366" />
            </Pressable>
          ) : hasText ? (
            <Pressable
              accessibilityLabel="Send chat message"
              accessibilityRole="button"
              onPress={handleSend}
              className="w-8 h-8 rounded-lg items-center justify-center"
              style={{ backgroundColor: "#00E5FF" } as never}
            >
              <SendHorizontal size={14} color="#FFFFFF" strokeWidth={2} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {enhancing && (
        <Text style={{ color: "#7C4DFF", fontSize: 10, marginTop: 4, marginLeft: 8 }}>
          Improving prompt...
        </Text>
      )}
    </View>
  );
};

export default ChatInput;
