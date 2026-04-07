import { View, Text, Pressable, ScrollView } from "react-native";
import { GitCommitHorizontal, RotateCcw } from "lucide-react-native";
import { useProjectStore, type Version } from "@/stores/project-store";

interface VersionTimelineProps {
  onRevert: (commitHash: string) => void;
}

const VersionTimeline = ({ onRevert }: VersionTimelineProps) => {
  const versions = useProjectStore((s) => s.versions);
  const currentVersion = useProjectStore((s) => s.currentVersion);

  if (versions.length === 0) return null;

  return (
    <View className="border-t border-border-subtle" style={{ backgroundColor: "#0D0D1A" }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 6, gap: 6 }}
      >
        {versions.map((v) => (
          <VersionChip
            key={v.hash}
            version={v}
            isCurrent={v.number === currentVersion}
            onRevert={() => onRevert(v.hash)}
          />
        ))}
      </ScrollView>
    </View>
  );
};

interface VersionChipProps {
  version: Version;
  isCurrent: boolean;
  onRevert: () => void;
}

const VersionChip = ({ version, isCurrent, onRevert }: VersionChipProps) => (
  <Pressable
    onPress={isCurrent ? undefined : onRevert}
    className={`flex-row items-center gap-1.5 px-2.5 py-1 rounded-md border ${
      isCurrent
        ? "border-accent-cyan/30 bg-accent-cyan-dim"
        : "border-border-subtle"
    }`}
  >
    {isCurrent ? (
      <GitCommitHorizontal size={11} color="#00E5FF" strokeWidth={1.5} />
    ) : (
      <RotateCcw size={10} color="#4A4A6A" strokeWidth={1.5} />
    )}
    <Text
      className={`text-[10px] ${isCurrent ? "text-accent-cyan" : "text-txt-dim"}`}
      numberOfLines={1}
    >
      v{version.number}
    </Text>
    <Text className="text-txt-dim text-[9px]" numberOfLines={1} style={{ maxWidth: 120 }}>
      {version.description}
    </Text>
  </Pressable>
);

export default VersionTimeline;
