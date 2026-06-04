// Live "watch it build" panel: streams pipeline phases and a human-readable meaning for each
// file as the agent generates an app. Raw code is intentionally NOT shown here — it lives only
// in the code generator (CodeViewer). Meaning comes from the model's own plan descriptions.
import { View, Text, ActivityIndicator } from "react-native";
import { Check, FileCode2 } from "lucide-react-native";
import { useProjectStore } from "@/stores/project-store";
import { buildFileMeanings, type FileMeaning } from "@/shared/lib/generation-narration";
import {
  GENERATION_STATUS_LABELS,
  isGenerationActive,
} from "@/shared/lib/generation-status";
import type { ProjectStatus } from "@/shared/schemas/ws-messages";

const PHASES: { key: ProjectStatus; label: string }[] = [
  { key: "planning", label: "Plan" },
  { key: "scaffolding", label: "Scaffold" },
  { key: "generating", label: "Generate" },
  { key: "analyzing", label: "Analyze" },
  { key: "validating", label: "Validate" },
  { key: "building", label: "Build" },
  { key: "ready", label: "Ready" },
];

const PHASE_RANK: Record<string, number> = {
  planning: 0,
  scaffolding: 1,
  generating: 2,
  analyzing: 3,
  validating: 4,
  building: 5,
  ready: 6,
};

interface FileCardProps {
  file: FileMeaning;
}

const FileCard = ({ file }: FileCardProps) => {
  const isStreaming = file.status === "streaming";

  return (
    <View
      className="rounded-xl overflow-hidden mb-2"
      style={{
        backgroundColor: "rgba(10,10,18,0.6)",
        borderWidth: 1,
        borderColor: isStreaming
          ? "rgba(0,229,255,0.35)"
          : "rgba(255,255,255,0.08)",
      }}
    >
      <View className="flex-row items-center gap-2 px-3 py-2">
        <FileCode2
          size={13}
          color={isStreaming ? "#00E5FF" : "#7C4DFF"}
          strokeWidth={1.75}
        />
        <View style={{ flex: 1 }}>
          <Text
            style={{ fontSize: 12, color: "#D8D8EC", fontFamily: "monospace" }}
            numberOfLines={1}
          >
            {file.path}
          </Text>
          <Text style={{ fontSize: 11, color: "#9AA0BC", lineHeight: 15 }} numberOfLines={2}>
            {file.meaning}
          </Text>
        </View>
        {isStreaming ? (
          <ActivityIndicator size="small" color="#00E5FF" />
        ) : (
          <View
            className="w-4 h-4 rounded-full items-center justify-center"
            style={{ backgroundColor: "rgba(0,255,136,0.15)" }}
          >
            <Check size={11} color="#00FF88" strokeWidth={3} />
          </View>
        )}
      </View>
    </View>
  );
};

const PhaseTimeline = ({ status }: { status: ProjectStatus }) => {
  const currentRank = PHASE_RANK[status] ?? 0;
  return (
    <View className="flex-row items-center gap-1 mb-3 flex-wrap">
      {PHASES.map((phase, index) => {
        const rank = PHASE_RANK[phase.key] ?? 0;
        const isDone = rank < currentRank || status === "ready";
        const isActive = rank === currentRank && status !== "ready";
        const color = isActive ? "#00E5FF" : isDone ? "#00FF88" : "#5A5A72";
        return (
          <View key={phase.key} className="flex-row items-center gap-1">
            <View
              className="px-2 py-0.5 rounded-md"
              style={{
                backgroundColor: isActive
                  ? "rgba(0,229,255,0.12)"
                  : isDone
                    ? "rgba(0,255,136,0.1)"
                    : "rgba(255,255,255,0.04)",
              }}
            >
              <Text style={{ fontSize: 9, fontWeight: "700", color }}>
                {phase.label}
              </Text>
            </View>
            {index < PHASES.length - 1 && (
              <Text style={{ fontSize: 9, color: "#3A3A52" }}>›</Text>
            )}
          </View>
        );
      })}
    </View>
  );
};

const GenerationActivity = () => {
  const status = useProjectStore((s) => s.status);
  const files = useProjectStore((s) => s.generationFiles);
  const progress = useProjectStore((s) => s.generationProgress);
  const plan = useProjectStore((s) => s.plan);

  const active = isGenerationActive(status);
  if (!active && files.length === 0) {
    return null;
  }

  const fileMeanings = buildFileMeanings(files, plan);
  const doneCount = files.filter((f) => f.status === "done").length;

  return (
    <View className="px-4 py-3 animate-fade-in">
      <View
        className="rounded-2xl px-3 py-3"
        style={{
          backgroundColor: "rgba(124,77,255,0.06)",
          borderWidth: 1,
          borderColor: "rgba(124,77,255,0.2)",
        }}
      >
        <View className="flex-row items-center gap-2 mb-2">
          {active && <ActivityIndicator size="small" color="#7C4DFF" />}
          <Text style={{ fontSize: 13, fontWeight: "700", color: "#E8E8F4", flex: 1 }}>
            {active
              ? GENERATION_STATUS_LABELS[status] ?? "Building your app…"
              : "Build complete"}
          </Text>
          {files.length > 0 && (
            <Text style={{ fontSize: 11, color: "#A0A8C0", fontWeight: "600" }}>
              {doneCount}/{files.length}
            </Text>
          )}
        </View>

        <PhaseTimeline status={status} />

        {active && progress > 0 && progress < 1 && (
          <View
            className="rounded-full overflow-hidden mb-3"
            style={{ height: 3, backgroundColor: "rgba(255,255,255,0.06)" }}
          >
            <View
              style={{
                height: "100%",
                width: `${Math.round(progress * 100)}%`,
                backgroundColor: "#7C4DFF",
                borderRadius: 999,
              }}
            />
          </View>
        )}

        {fileMeanings.map((file) => (
          <FileCard key={file.path} file={file} />
        ))}
      </View>
    </View>
  );
};

export default GenerationActivity;
