// Splits preview rendering by runtime state so web iframe UX and native fallback stay explicit.
import { useCallback } from "react";
import { View, Text, Pressable, Linking } from "react-native";
import { Globe, RotateCw, ExternalLink, Loader } from "lucide-react-native";
import { apiClient } from "@/shared/lib/api-client";
import { useProjectStore } from "@/stores/project-store";

const PreviewSurface = ({
  iframeSrc,
}: {
  iframeSrc: string;
}) => {
  if (typeof window === "undefined") {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-ink-light text-xs text-center leading-5">
          Native preview surface is not wired yet.{"\n"}Use the shared preview URL for now.
        </Text>
      </View>
    );
  }

  return (
    <iframe
      src={iframeSrc}
      style={{ width: "100%", height: "100%", border: "none", backgroundColor: "#0D0D1A" }}
      title="App Preview"
      allow="clipboard-read; clipboard-write"
    />
  );
};

const PreviewPanel = () => {
  const previewPort = useProjectStore((state) => state.previewPort);
  const projectName = useProjectStore((state) => state.projectName);
  const status = useProjectStore((state) => state.status);
  const previewStatus = useProjectStore((state) => state.previewStatus);
  const previewRevision = useProjectStore((state) => state.previewRevision);
  const lastPreviewError = useProjectStore((state) => state.lastPreviewError);
  const bumpPreviewRevision = useProjectStore((state) => state.bumpPreviewRevision);

  // Reactive iframe src: render immediately when port + project are available
  const iframeSrc = previewPort && projectName && previewStatus === "ready"
    ? `${apiClient.getPreviewProxyUrl(projectName)}?v=${previewPort}-${previewRevision}`
    : "";

  const isLoading = ["planning", "scaffolding", "generating", "building", "analyzing", "validating"].includes(status);
  const isPreviewStarting = previewStatus === "starting";
  const isError = previewStatus === "error";
  const proxyUrl = projectName ? apiClient.getPreviewProxyUrl(projectName) : "";

  const handleRefresh = useCallback(() => {
    bumpPreviewRevision();
  }, [bumpPreviewRevision]);

  const handleOpenExternal = useCallback(() => {
    if (proxyUrl) void Linking.openURL(proxyUrl);
  }, [proxyUrl]);

  return (
    <View className="flex-1" style={{ backgroundColor: "rgba(18,18,31,0.6)" }}>
      {/* Header */}
      <View
        className="h-10 px-4 flex-row items-center"
        style={{ borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" }}
      >
        <Globe size={13} color="#00E5FF" strokeWidth={1.5} />
        <Text className="text-ink-muted text-[10px] uppercase tracking-widest ml-2 font-semibold">
          Preview
        </Text>
      </View>

      {/* URL bar */}
      {previewPort && (
        <View
          className="h-9 px-3 flex-row items-center gap-2"
          style={{ borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" }}
        >
          <Pressable onPress={handleRefresh}>
            <RotateCw size={12} color="#00E5FF" strokeWidth={1.5} />
          </Pressable>
          <View
            className="flex-1 h-6 rounded-md px-2.5 flex-row items-center"
            style={{ backgroundColor: "rgba(26,26,46,0.6)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}
          >
            <Text className="text-ink-faint text-[10px] font-mono">
              {projectName ?? "preview"} : {previewPort}
            </Text>
          </View>
          <Pressable onPress={handleOpenExternal}>
            <ExternalLink size={12} color="#00E5FF" strokeWidth={1.5} />
          </Pressable>
        </View>
      )}

      {/* Content */}
      {!iframeSrc ? (
        <View className="flex-1 items-center justify-center">
          {isError && projectName ? (
            <>
              <View
                className="w-16 h-16 rounded-full items-center justify-center"
                style={{ backgroundColor: "rgba(255, 51, 102, 0.08)", borderWidth: 2, borderColor: "rgba(255, 51, 102, 0.2)" }}
              >
                <Globe size={24} color="#FF3366" strokeWidth={1.5} />
              </View>
              <Text className="text-xs mt-4 font-semibold" style={{ color: "#FF3366" }}>
                Preview unavailable
              </Text>
              <Text className="text-ink-light text-xs text-center leading-5 mt-2">
                {lastPreviewError ?? "Metro reported an error. Fix the build and restart preview."}
              </Text>
            </>
          ) : isLoading || isPreviewStarting || projectName ? (
            <>
              <View
                className="w-16 h-16 rounded-full items-center justify-center"
                style={{ backgroundColor: "rgba(0, 229, 255, 0.08)", borderWidth: 2, borderColor: "rgba(0, 229, 255, 0.2)" }}
              >
                <Loader size={24} color="#00E5FF" strokeWidth={1.5} />
              </View>
              <Text className="text-neon-cyan text-xs mt-4 uppercase tracking-widest font-semibold">
                {status === "planning"
                  ? "Planning..."
                  : status === "scaffolding"
                    ? "Scaffolding..."
                    : status === "generating"
                      ? "Generating..."
                      : isPreviewStarting
                        ? "Starting preview..."
                        : "Preparing preview..."}
              </Text>
            </>
          ) : (
            <>
              <View className="w-14 h-14 rounded-2xl items-center justify-center mb-3" style={{ backgroundColor: "rgba(0, 229, 255, 0.08)" }}>
                <Globe size={24} color="#00E5FF" strokeWidth={1} />
              </View>
              <Text className="text-ink-light text-xs text-center leading-5">
                Preview appears here{"\n"}after generation
              </Text>
            </>
          )}
        </View>
      ) : (
        <View className="flex-1">
          <PreviewSurface iframeSrc={iframeSrc} />
        </View>
      )}
    </View>
  );
};

export default PreviewPanel;
