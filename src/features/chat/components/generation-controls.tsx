// Abort / Continue controls — always visible when pipeline is busy or codegen can resume.
import { Pressable, Text, View } from "react-native";
import { Play, Square } from "lucide-react-native";
import { mixedStyle } from "@/shared/lib/web-styles";

interface GenerationControlsProps {
  showAbort: boolean;
  showContinue: boolean;
  isResuming: boolean;
  missingFileCount?: number;
  resumeMode?: "codegen" | "ship" | null;
  onAbort: () => void;
  onContinue: () => void;
}

export const GenerationControls = ({
  showAbort,
  showContinue,
  isResuming,
  missingFileCount,
  resumeMode,
  onAbort,
  onContinue,
}: GenerationControlsProps) => {
  if (!showAbort && !showContinue) {
    return null;
  }

  return (
    <View
      className="mx-3 mb-2 px-3 py-2 rounded-lg flex-row items-center gap-2"
      style={mixedStyle({
        backgroundColor: "rgba(18, 18, 31, 0.9)",
        borderWidth: 1,
        borderColor: "rgba(255, 255, 255, 0.08)",
      })}
    >
      {showContinue && (
        <Pressable
          accessibilityLabel="Continue generation"
          accessibilityRole="button"
          onPress={onContinue}
          disabled={isResuming}
          className="flex-1 flex-row items-center justify-center gap-2 py-2 rounded-md"
          style={{
            backgroundColor: isResuming ? "rgba(0,229,255,0.08)" : "rgba(0,229,255,0.18)",
            opacity: isResuming ? 0.6 : 1,
          }}
        >
          <Play size={12} color="#00E5FF" fill="#00E5FF" />
          <Text className="text-[#00E5FF] text-xs font-semibold">
            {isResuming
              ? "Resuming…"
              : resumeMode === "ship"
                ? "Retry preview"
                : missingFileCount
                  ? `Continue (${missingFileCount} left)`
                  : "Continue generation"}
          </Text>
        </Pressable>
      )}
      {showAbort && (
        <Pressable
          accessibilityLabel="Stop generation"
          accessibilityRole="button"
          onPress={onAbort}
          className="flex-row items-center justify-center gap-2 px-4 py-2 rounded-md"
          style={{
            backgroundColor: "rgba(255, 51, 102, 0.15)",
            borderWidth: 1,
            borderColor: "rgba(255, 51, 102, 0.35)",
            flexGrow: showContinue ? 0 : 1,
            flex: showContinue ? undefined : 1,
          }}
        >
          <Square size={12} color="#FF3366" fill="#FF3366" />
          <Text style={{ color: "#FF3366", fontSize: 12, fontWeight: "600" }}>Stop</Text>
        </Pressable>
      )}
    </View>
  );
};
