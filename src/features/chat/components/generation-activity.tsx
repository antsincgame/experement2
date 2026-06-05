// Compact live pipeline header in chat — phase timeline only while the agent is running.
// Per-file progress lives in chronological process messages, not in a monolithic bottom block.
import { View, Text, ActivityIndicator } from "react-native";
import { useProjectStore } from "@/stores/project-store";
import { GENERATION_PHASE_RANK, isGenerationActive } from "@/shared/lib/generation-status";
import {
  getGenerationActivityHeader,
  isPipelineFullyShipped,
  resolveTimelineRank,
  type GenerationCheckpoint,
} from "@/shared/lib/generation-pipeline-truth";
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

const PhaseTimeline = ({
  status,
  checkpoint,
}: {
  status: ProjectStatus;
  checkpoint: GenerationCheckpoint;
}) => {
  const currentRank = resolveTimelineRank(status, checkpoint);
  const fullyShipped = isPipelineFullyShipped(checkpoint);
  return (
    <View className="flex-row items-center gap-1 flex-wrap">
      {PHASES.map((phase, index) => {
        const rank = GENERATION_PHASE_RANK[phase.key] ?? 0;
        const isDone = fullyShipped ? rank <= GENERATION_PHASE_RANK.ready : rank < currentRank;
        const isActive = !fullyShipped && rank === currentRank && isGenerationActive(status);
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
  const checkpoint = useProjectStore((s) => s.generationCheckpoint);
  const progress = useProjectStore((s) => s.generationProgress);
  const files = useProjectStore((s) => s.generationFiles);

  // Chat iterate uses "analyzing" too — keep that phase in the message timeline only.
  const showCompactPanel =
    isGenerationActive(status) &&
    status !== "analyzing";
  if (!showCompactPanel) {
    return null;
  }

  const doneCount = files.filter((f) => f.status === "done").length;

  return (
    <View className="px-4 py-2 animate-fade-in">
      <View
        className="rounded-xl px-3 py-2.5"
        style={{
          backgroundColor: "rgba(124,77,255,0.06)",
          borderWidth: 1,
          borderColor: "rgba(124,77,255,0.2)",
        }}
      >
        <View className="flex-row items-center gap-2 mb-2">
          <ActivityIndicator size="small" color="#7C4DFF" />
          <Text style={{ fontSize: 12, fontWeight: "700", color: "#E8E8F4", flex: 1 }}>
            {getGenerationActivityHeader(status, checkpoint)}
          </Text>
          {files.length > 0 && (
            <Text style={{ fontSize: 10, color: "#A0A8C0", fontWeight: "600" }}>
              {doneCount}/{files.length}
            </Text>
          )}
        </View>

        <PhaseTimeline status={status} checkpoint={checkpoint} />

        {progress > 0 && progress < 1 && (
          <View
            className="rounded-full overflow-hidden mt-2"
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
      </View>
    </View>
  );
};

export default GenerationActivity;
