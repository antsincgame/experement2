// Uses the shared API client for preview URLs so external opens respect the current agent URL.
import { useState, useCallback, useEffect, useRef } from "react";
import { View, Text, Pressable, Linking } from "react-native";
import { Globe, RotateCw, ExternalLink, Loader } from "lucide-react-native";
import { apiClient } from "@/shared/lib/api-client";
import { useProjectStore } from "@/stores/project-store";

const PreviewPanel = () => {
  const previewPort = useProjectStore((state) => state.previewPort);
  const status = useProjectStore((state) => state.status);
  const [refreshKey, setRefreshKey] = useState(0);
  const prevPort = useRef(previewPort);

  useEffect(() => {
    if (previewPort && previewPort !== prevPort.current) {
      const timeout = setTimeout(() => setRefreshKey((key) => key + 1), 2000);
      prevPort.current = previewPort;
      return () => clearTimeout(timeout);
    }
  }, [previewPort]);

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
              port:{previewPort}
            </Text>
          </View>
          <Pressable onPress={handleOpenExternal}>
            <ExternalLink size={12} color="#00E5FF" strokeWidth={1.5} />
          </Pressable>
        </View>
      )}

      {isLoading && !previewPort ? (
        <View className="flex-1 items-center justify-center">
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
                  : status === "building"
                    ? "Building..."
                    : "Processing..."}
          </Text>
        </View>
      ) : previewPort ? (
        <View className="flex-1">
          {typeof window !== "undefined" && (
            <iframe
              key={refreshKey}
              src={proxyUrl}
              style={{ width: "100%", height: "100%", border: "none", backgroundColor: "#FAFAFF" }}
              title="App Preview"
              allow="clipboard-read; clipboard-write"
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
