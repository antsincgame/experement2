import { useState, useCallback, useRef, useEffect } from "react";
import { View, TextInput, Pressable, Platform } from "react-native";
import { SendHorizontal, Square } from "lucide-react-native";

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
  const inputRef = useRef<TextInput>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  }, [text, onSend]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSend();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSend]);

  const hasText = text.trim().length > 0;

  return (
    <View className="px-3 py-3" style={{ borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.06)" }}>
      <View
        className="flex-row items-end rounded-xl overflow-hidden"
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.7)",
          borderWidth: 1,
          borderColor: "rgba(0, 229, 255, 0.2)",
        }}
      >
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor="#8888AA"
          multiline
          className="flex-1 text-ink-dark text-sm px-4 py-3 max-h-32"
          style={{ fontFamily: "Inter, system-ui, sans-serif", outlineStyle: "none" } as never}
        />
        {isGenerating ? (
          <Pressable
            onPress={onAbort}
            className="m-1.5 w-8 h-8 rounded-lg items-center justify-center"
            style={{ backgroundColor: "rgba(255, 51, 102, 0.15)" }}
          >
            <Square size={14} color="#FF3366" strokeWidth={1.5} fill="#FF3366" />
          </Pressable>
        ) : hasText ? (
          <Pressable
            onPress={handleSend}
            className="m-1.5 w-8 h-8 rounded-lg items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #00E5FF, #7C4DFF)",
              backgroundColor: "#00E5FF",
            } as never}
          >
            <SendHorizontal size={14} color="#FFFFFF" strokeWidth={2} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
};

export default ChatInput;
