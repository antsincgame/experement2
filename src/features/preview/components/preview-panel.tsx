// Uses the shared API client for preview URLs so external opens respect the current agent URL.
import { useState, useCallback, useEffect, useRef } from "react";
import { View, Text, Pressable, Linking } from "react-native";
import { Globe, RotateCw, ExternalLink, Loader } from "lucide-react-native";
import { apiClient } from "@/shared/lib/api-client";
import { useProjectStore } from "@/stores/project-store";

const PreviewPanel = () => {
  const previewPort = useProjectStore((state) => state.previewPort);
  const previewUrl = useProjectStore((state) => state.previewUrl);
  const projectName = useProjectStore((state) => state.projectName);
  const status = useProjectStore((state) => state.status);
  const [refreshKey, setRefreshKey] = useState(0);

  // Subscribe to store changes — force refresh whenever previewPort or projectName changes
  useEffect(() => {
    const unsub = useProjectStore.subscribe(
      (state, prevState) => {
        const portChanged = state.previewPort !== prevState.previewPort;
        const projectChanged = state.projectName !== prevState.projectName;

        if (portChanged && state.previewPort) {
          // Port changed — new preview ready, refresh after brief delay for proxy to settle
          setTimeout(() => setRefreshKey((k) => k + 1), 800);
        } else if (projectChanged && state.previewPort) {
          // Project switched but port may be same — still force refresh after proxy switch
          setTimeout(() => setRefreshKey((k) => k + 1), 1500);
        }
      },
    );
    return unsub;
  }, []);

  const isLoading = [
    "planning",
    "scaffolding",
    "generating",
    "building",
    "analyzing",
    "validating",
  ].includes(status);
  const proxyUrl = apiClient.getPreviewProxyUrl();

  const handleRefresh = useCallback(() => {
    setRefreshKey((key) => key + 1);
  }, []);

  const handleOpenExternal = useCallback(() => {
    void Linking.openURL(proxyUrl);
  }, [proxyUrl]);

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
          <Pressable onPress={handleRefresh}>
            <RotateCw size={12} color="#00E5FF" strokeWidth={1.5} />
          </Pressable>
          <View
            className="flex-1 h-6 rounded-md px-2.5 flex-row items-center"
            style={{
              backgroundColor: "rgba(255,255,255,0.6)",
              borderWidth: 1,
              borderColor: "rgba(0,0,0,0.06)",
            }}
          >
            <Text className="text-ink-light text-[10px] font-mono">
              {projectName ? `${projectName} — port:${previewPort}` : `port:${previewPort}`}
            </Text>
          </View>
          <Pressable onPress={handleOpenExternal}>
            <ExternalLink size={12} color="#00E5FF" strokeWidth={1.5} />
          </Pressable>
        </View>
      )}

      {!previewPort ? (
        <View className="flex-1 items-center justify-center">
          {isLoading || projectName ? (
            <>
              <View
                className="w-16 h-16 rounded-full items-center justify-center"
                style={{
                  backgroundColor: "rgba(0, 229, 255, 0.08)",
                  borderWidth: 2,
                  borderColor: "rgba(0, 229, 255, 0.2)",
                }}
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
                      : "Starting preview..."}
              </Text>
            </>
          ) : (
            <>
              <View
                className="w-14 h-14 rounded-2xl items-center justify-center mb-3"
                style={{ backgroundColor: "rgba(0, 229, 255, 0.08)" }}
              >
                <Globe size={24} color="#00E5FF" strokeWidth={1} />
              </View>
              <Text className="text-ink-light text-xs text-center leading-5">
                Preview appears here{"\n"}after generation
              </Text>
            </>
          )}
        </View>
      ) : previewPort ? (
        <View className="flex-1">
          {typeof window !== "undefined" && (
            <iframe
              key={`${projectName}-${previewPort}-${refreshKey}`}
              src={proxyUrl}
              style={{ width: "100%", height: "100%", border: "none", backgroundColor: "#FAFAFF" }}
              title="App Preview"
              allow="clipboard-read; clipboard-write"
            />
          )}
        </View>
      )}
    </View>
  );
};

export default PreviewPanel;
