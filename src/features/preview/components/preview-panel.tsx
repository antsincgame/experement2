import { View, Text, Pressable } from "react-native";
import { Globe, RotateCw, ExternalLink, Loader } from "lucide-react-native";
import { useProjectStore } from "@/stores/project-store";
import { useSettingsStore } from "@/stores/settings-store";

const PreviewPanel = () => {
  const previewPort = useProjectStore((s) => s.previewPort);
  const status = useProjectStore((s) => s.status);
  const agentUrl = useSettingsStore((s) => s.agentUrl);

  const isLoading = ["planning", "scaffolding", "generating", "building", "analyzing", "validating"].includes(status);
  const previewUrl = `${agentUrl}/preview/`;

  return (
    <View className="flex-1" style={{ backgroundColor: "rgba(255,255,255,0.3)" }}>
      <View
        className="h-10 px-4 flex-row items-center"
        style={{ borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.06)" }}
      >
        <Globe size={13} color="#00E5FF" strokeWidth={1.5} />
        <Text className="text-ink-muted text-[10px] uppercase tracking-widest ml-2 font-semibold">
          Preview
        </Text>
      </View>

      {previewPort && (
        <View
          className="h-9 px-3 flex-row items-center gap-2"
          style={{ borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.04)" }}
        >
          <Pressable style={{ opacity: 0.5 }}>
            <RotateCw size={12} color="#4A4A6A" strokeWidth={1.5} />
          </Pressable>
          <View
            className="flex-1 h-6 rounded-md px-2.5 flex-row items-center"
            style={{ backgroundColor: "rgba(255,255,255,0.6)", borderWidth: 1, borderColor: "rgba(0,0,0,0.06)" }}
          >
            <Text className="text-ink-light text-[10px] font-mono">
              localhost:{previewPort}
            </Text>
          </View>
          <Pressable style={{ opacity: 0.5 }}>
            <ExternalLink size={12} color="#4A4A6A" strokeWidth={1.5} />
          </Pressable>
        </View>
      )}

      {isLoading && !previewPort ? (
        <View className="flex-1 items-center justify-center">
          <View className="w-16 h-16 rounded-full items-center justify-center animate-glow-pulse"
            style={{
              backgroundColor: "rgba(0, 229, 255, 0.08)",
              borderWidth: 2,
              borderColor: "rgba(0, 229, 255, 0.2)",
            }}
          >
            <Loader size={24} color="#00E5FF" strokeWidth={1.5} />
          </View>
          <Text className="text-neon-cyan text-xs mt-4 uppercase tracking-widest font-semibold">
            {status === "planning" ? "Planning..." :
             status === "scaffolding" ? "Scaffolding..." :
             status === "generating" ? "Generating..." :
             status === "building" ? "Building..." :
             "Processing..."}
          </Text>
        </View>
      ) : previewPort ? (
        <View className="flex-1">
          {typeof window !== "undefined" && (
            <iframe
              src={previewUrl}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              style={{ width: "100%", height: "100%", border: "none", backgroundColor: "#FAFAFF" }}
              title="App Preview"
            />
          )}
        </View>
      ) : (
        <View className="flex-1 items-center justify-center px-6">
          <View
            className="w-14 h-14 rounded-2xl items-center justify-center mb-3"
            style={{ backgroundColor: "rgba(0, 229, 255, 0.08)" }}
          >
            <Globe size={24} color="#00E5FF" strokeWidth={1} />
          </View>
          <Text className="text-ink-light text-xs text-center leading-5">
            Preview appears here{"\n"}after generation
          </Text>
        </View>
      )}
    </View>
  );
};

export default PreviewPanel;
