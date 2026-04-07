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
import { mixedStyle } from "@/shared/lib/web-styles";
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
  const [enhanceError, setEnhanceError] = useState<string | null>(null);
  const handleSendRef = useRef<() => void>(() => undefined);
  const enhanceErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  useEffect(() => () => {
    if (enhanceErrorTimerRef.current) {
      clearTimeout(enhanceErrorTimerRef.current);
    }
  }, []);

  const handleEnhance = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    setEnhancing(true);
    setEnhanceError(null);
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
      const msg = error instanceof Error ? error.message : "Enhancement failed";
      setEnhanceError(msg);
      useSettingsStore.getState().addErrorLog({ level: "error", source: "enhance", message: msg });
      if (enhanceErrorTimerRef.current) {
        clearTimeout(enhanceErrorTimerRef.current);
      }
      enhanceErrorTimerRef.current = setTimeout(() => {
        setEnhanceError(null);
        enhanceErrorTimerRef.current = null;
      }, 4_000);
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
      style={{ borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" }}
    >
      <View
        className="flex-row items-end rounded-xl overflow-hidden"
        style={{
          backgroundColor: "rgba(26, 26, 46, 0.6)",
          borderWidth: 1,
          borderColor: "rgba(255, 215, 0, 0.15)",
        }}
      >
        <TextInput
          accessibilityLabel="Chat message input"
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor="#4A4A6A"
          multiline
          className="flex-1 text-white text-sm px-4 py-3 max-h-32"
          style={mixedStyle({ fontFamily: "Inter, system-ui, sans-serif", outlineStyle: "none" })}
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
              style={{ backgroundColor: "#FFD700" }}
            >
              <SendHorizontal size={14} color="#0A0A0A" strokeWidth={2} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {enhancing && (
        <Text style={{ color: "#7C4DFF", fontSize: 10, marginTop: 4, marginLeft: 8 }}>
          Improving prompt...
        </Text>
      )}
      {enhanceError && (
        <Text style={{ color: "#FF3366", fontSize: 10, marginTop: 4, marginLeft: 8 }} numberOfLines={2}>
          {enhanceError}
        </Text>
      )}
    </View>
  );
};

export default ChatInput;
