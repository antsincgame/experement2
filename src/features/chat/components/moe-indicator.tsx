// Shows which LLM roles are active (planner / generation / fix) during create and iterate.
import { View, Text } from "react-native";
import { Bot } from "lucide-react-native";
import { useSettingsStore } from "@/stores/settings-store";

const shortName = (model: string): string =>
  model.split("/").pop()?.slice(0, 14) || "Auto";

export const MoeIndicator = () => {
  const model = useSettingsStore((s) => s.model);
  const plannerModel = useSettingsStore((s) => s.plannerModel);
  const editorModel = useSettingsStore((s) => s.editorModel);
  const generationLabel = shortName(model);
  const plannerLabel = shortName(plannerModel || model);
  const fixLabel = shortName(editorModel || model);
  const showFixChip = Boolean(editorModel.trim()) && fixLabel !== generationLabel;

  return (
    <View className="flex-row items-center gap-2 flex-wrap">
      <View className="flex-row items-center gap-1">
        <Bot size={10} color="#7C4DFF" strokeWidth={1.5} />
        <Text style={{ fontSize: 9, color: "#B388FF", fontWeight: "600" }}>
          Plan: {plannerLabel}
        </Text>
      </View>
      <View className="flex-row items-center gap-1">
        <Bot size={10} color="#00E5FF" strokeWidth={1.5} />
        <Text style={{ fontSize: 9, color: "#00E5FF", fontWeight: "600" }}>
          Gen: {generationLabel}
        </Text>
      </View>
      {showFixChip && (
        <View className="flex-row items-center gap-1">
          <Bot size={10} color="#FF9F43" strokeWidth={1.5} />
          <Text style={{ fontSize: 9, color: "#FF9F43", fontWeight: "600" }}>
            Fix: {fixLabel}
          </Text>
        </View>
      )}
    </View>
  );
};
