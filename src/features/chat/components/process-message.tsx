// Renders structured pipeline narration (plan stream, phases, MoE, fixes) in the chat feed.
import { View, Text, ActivityIndicator } from "react-native";
import {
  Bot,
  FileCode2,
  Hammer,
  Layers,
  Loader,
  ScrollText,
  Wrench,
} from "lucide-react-native";
import type { ChatMessage, ProcessKind } from "../schemas/message.schema";
import MarkdownRenderer from "./markdown-renderer";

const KIND_META: Record<
  ProcessKind,
  { label: string; color: string; bg: string; border: string }
> = {
  plan: {
    label: "Plan",
    color: "#B388FF",
    bg: "rgba(124,77,255,0.1)",
    border: "rgba(124,77,255,0.28)",
  },
  phase: {
    label: "Phase",
    color: "#FFD700",
    bg: "rgba(255,215,0,0.08)",
    border: "rgba(255,215,0,0.22)",
  },
  moe: {
    label: "Model",
    color: "#00E5FF",
    bg: "rgba(0,229,255,0.08)",
    border: "rgba(0,229,255,0.22)",
  },
  file: {
    label: "File",
    color: "#7C4DFF",
    bg: "rgba(124,77,255,0.06)",
    border: "rgba(124,77,255,0.18)",
  },
  fix: {
    label: "Fix",
    color: "#FF9F43",
    bg: "rgba(255,159,67,0.08)",
    border: "rgba(255,159,67,0.25)",
  },
  build: {
    label: "Build",
    color: "#00FF88",
    bg: "rgba(0,255,136,0.06)",
    border: "rgba(0,255,136,0.2)",
  },
};

const KindIcon = ({ kind, color }: { kind: ProcessKind; color: string }) => {
  const size = 12;
  const stroke = 2;
  switch (kind) {
    case "plan":
      return <ScrollText size={size} color={color} strokeWidth={stroke} />;
    case "phase":
      return <Layers size={size} color={color} strokeWidth={stroke} />;
    case "moe":
      return <Bot size={size} color={color} strokeWidth={stroke} />;
    case "file":
      return <FileCode2 size={size} color={color} strokeWidth={stroke} />;
    case "fix":
      return <Wrench size={size} color={color} strokeWidth={stroke} />;
    case "build":
      return <Hammer size={size} color={color} strokeWidth={stroke} />;
    default:
      return <Loader size={size} color={color} strokeWidth={stroke} />;
  }
};

interface ProcessMessageProps {
  message: ChatMessage;
}

const ProcessMessage = ({ message }: ProcessMessageProps) => {
  const kind = message.processKind ?? "phase";
  const meta = KIND_META[kind];
  const isStreaming = message.status === "streaming";

  return (
    <View className="px-4 py-1.5 animate-fade-in">
      <View
        className="rounded-xl overflow-hidden"
        style={{
          backgroundColor: meta.bg,
          borderWidth: 1,
          borderColor: meta.border,
        }}
      >
        <View className="flex-row items-center gap-2 px-3 py-2">
          <KindIcon kind={kind} color={meta.color} />
          <Text style={{ fontSize: 10, fontWeight: "700", color: meta.color, letterSpacing: 0.6 }}>
            {meta.label.toUpperCase()}
          </Text>
          {isStreaming && <ActivityIndicator size="small" color={meta.color} />}
        </View>
        <View className="px-3 pb-2.5">
          {kind === "plan" || kind === "phase" ? (
            <MarkdownRenderer content={message.content} />
          ) : (
            <Text
              style={{
                fontSize: 12,
                lineHeight: 17,
                color: "#C8C8DC",
                fontFamily: kind === "file" || kind === "fix" ? "monospace" : undefined,
              }}
            >
              {message.content}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
};

export default ProcessMessage;
