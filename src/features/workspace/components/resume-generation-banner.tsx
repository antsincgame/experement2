// Banner when a project has a saved plan but codegen was interrupted — offers global resume.
import { Pressable, Text, View } from "react-native";
import { Play } from "lucide-react-native";
import { mixedStyle } from "@/shared/lib/web-styles";

interface ResumeGenerationBannerProps {
  projectName: string;
  missingFileCount: number;
  totalPlanFiles: number;
  isResuming: boolean;
  onResume: () => void;
}

export const ResumeGenerationBanner = ({
  projectName,
  missingFileCount,
  totalPlanFiles,
  isResuming,
  onResume,
}: ResumeGenerationBannerProps) => (
  <View
    className="mx-3 mt-2 mb-1 px-3 py-3 rounded-lg"
    style={mixedStyle({
      backgroundColor: "rgba(255, 215, 0, 0.08)",
      borderWidth: 1,
      borderColor: "rgba(255, 215, 0, 0.35)",
    })}
  >
    <Text className="text-[#FFD700] text-xs font-semibold mb-1">
      Generation paused
    </Text>
    <Text className="text-ink-light text-[11px] leading-4 mb-2">
      <Text style={{ fontFamily: "monospace", color: "#00E5FF" }}>{projectName}</Text>
      {" "}stopped mid-build ({missingFileCount} of {totalPlanFiles} files missing). Continue from the saved plan — finished files are skipped.
    </Text>
    <Pressable
      onPress={onResume}
      disabled={isResuming}
      className="flex-row items-center justify-center gap-2 py-2 rounded-md"
      style={{
        backgroundColor: isResuming ? "rgba(0,229,255,0.08)" : "rgba(0,229,255,0.18)",
        opacity: isResuming ? 0.6 : 1,
      }}
    >
      <Play size={12} color="#00E5FF" fill="#00E5FF" />
      <Text className="text-[#00E5FF] text-xs font-semibold">
        {isResuming ? "Resuming…" : "Continue generation"}
      </Text>
    </Pressable>
  </View>
);
