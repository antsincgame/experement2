// Splits preview rendering by runtime state so web iframe UX and native fallback stay explicit.
import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, Linking, Platform } from "react-native";
import { Globe, RotateCw, ExternalLink, Loader } from "lucide-react-native";
import { apiClient } from "@/shared/lib/api-client";
import { useProjectStore } from "@/stores/project-store";
import {
  prunePreviewFrames,
  resolvePreviewDisplay,
  upsertPreviewFrame,
  type PreviewFrame,
} from "@/features/preview/lib/preview-frame-pool";

const IS_WEB = Platform.OS === "web";
// How many previously-viewed previews keep their iframe (and last painted frame)
// alive in client memory. Older ones unmount on switch — the server's own
// MAX_LIVE_PREVIEWS budget independently bounds live Metro processes.
const MAX_KEPT_FRAMES = 3;

// buildId is folded into the cache-bust so a woken preview always gets a distinct
// src (a fresh build id every preview_ready) and reliably reloads off the frozen
// frame onto the newly-respawned Metro — even if port and revision coincide.
const buildPreviewSrc = (
  baseUrl: string,
  port: number,
  revision: number,
  buildId: string | null,
): string => `${baseUrl}?v=${port}-${revision}-${buildId ?? "0"}`;

const PreviewPlaceholder = ({
  isError,
  projectName,
  lastPreviewError,
  status,
  isLoading,
  isPreviewStarting,
}: {
  isError: boolean;
  projectName: string | null;
  lastPreviewError: string | null;
  status: string;
  isLoading: boolean;
  isPreviewStarting: boolean;
}) => {
  if (isError && projectName) {
    return (
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
    );
  }

  if (isLoading || isPreviewStarting || projectName) {
    return (
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
    );
  }

  return (
    <>
      <View className="w-14 h-14 rounded-2xl items-center justify-center mb-3" style={{ backgroundColor: "rgba(0, 229, 255, 0.08)" }}>
        <Globe size={24} color="#00E5FF" strokeWidth={1} />
      </View>
      <Text className="text-ink-light text-xs text-center leading-5">
        Preview appears here{"\n"}after generation
      </Text>
    </>
  );
};

// Native fallback: there is no DOM iframe off the web. A single surface keyed to the
// active preview URL, mirroring the pre-keep-alive behaviour exactly.
const NativePreviewSurface = ({ iframeSrc }: { iframeSrc: string }) => {
  if (typeof window === "undefined" || !iframeSrc) {
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

// Web keep-alive pool: every kept iframe stays mounted (keyed by project); only the
// active one is displayed. Hidden iframes retain their last painted frame even after
// the server kills their Metro process — that frozen frame bridges the wake.
const KeepAliveFrames = ({
  frames,
  activeProjectName,
}: {
  frames: PreviewFrame[];
  activeProjectName: string | null;
}) => (
  <>
    {frames.map((frame) => (
      <iframe
        key={frame.projectName}
        src={frame.src}
        title={`Preview ${frame.projectName}`}
        allow="clipboard-read; clipboard-write"
        style={{
          width: "100%",
          height: "100%",
          border: "none",
          backgroundColor: "#0D0D1A",
          display: frame.projectName === activeProjectName ? "block" : "none",
        }}
      />
    ))}
  </>
);

const PreviewPanel = () => {
  const previewPort = useProjectStore((state) => state.previewPort);
  const projectName = useProjectStore((state) => state.projectName);
  const status = useProjectStore((state) => state.status);
  const previewStatus = useProjectStore((state) => state.previewStatus);
  const previewRevision = useProjectStore((state) => state.previewRevision);
  const previewBuildId = useProjectStore((state) => state.previewBuildId);
  const lastPreviewError = useProjectStore((state) => state.lastPreviewError);
  const projectList = useProjectStore((state) => state.projectList);
  const bumpPreviewRevision = useProjectStore((state) => state.bumpPreviewRevision);

  // Keep-alive pool of previously-viewed preview iframes (web only).
  const [frames, setFrames] = useState<PreviewFrame[]>([]);

  // Serve the preview straight from Metro's origin: Expo emits absolute asset
  // paths that break when proxied under /preview/<project>/. The cache-busting
  // query forces an iframe reload on manual refresh and port changes.
  const previewBaseUrl = previewPort ? apiClient.getPreviewDirectUrl(previewPort) : "";
  const isActiveReady = !!previewBaseUrl && !!projectName && previewStatus === "ready";
  // One src serves both the web keep-alive pool and the native surface (only one branch
  // renders, gated by IS_WEB); null when there is no live preview to show.
  const previewSrc = isActiveReady
    ? buildPreviewSrc(previewBaseUrl, previewPort as number, previewRevision, previewBuildId)
    : null;

  // When the ACTIVE project's preview is ready, upsert its iframe as MRU with the
  // fresh src (reloading it to live). Background frames are left untouched, so they
  // keep their last painted frame after the server evicts their Metro process.
  useEffect(() => {
    if (!IS_WEB || !previewSrc || !projectName) {
      return;
    }
    setFrames((prev) => upsertPreviewFrame(prev, projectName, previewSrc, MAX_KEPT_FRAMES));
  }, [previewSrc, projectName]);

  // Forget iframes whose project was removed so a dead one is not kept mounted.
  useEffect(() => {
    if (!IS_WEB) {
      return;
    }
    setFrames((prev) => prunePreviewFrames(prev, projectList.map((entry) => entry.name)));
  }, [projectList]);

  const isLoading = ["planning", "scaffolding", "generating", "building", "analyzing", "validating"].includes(status);
  const isPreviewStarting = previewStatus === "starting";
  const isError = previewStatus === "error";

  const activeHasFrame = IS_WEB && frames.some((frame) => frame.projectName === projectName);
  // Show the frozen/live frame for the active project; fall back to the placeholder
  // only when there is nothing cached for it or the preview errored. While a cached
  // frame wakes (status not yet ready) we keep showing the frozen frame, not a spinner.
  const { showPlaceholder, isWaking } = resolvePreviewDisplay({
    hasActiveFrame: activeHasFrame,
    isError,
    isReady: previewStatus === "ready",
  });

  const handleRefresh = useCallback(() => {
    bumpPreviewRevision();
  }, [bumpPreviewRevision]);

  const handleOpenExternal = useCallback(() => {
    if (previewBaseUrl) void Linking.openURL(previewBaseUrl);
  }, [previewBaseUrl]);

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
      {IS_WEB ? (
        <View className="flex-1">
          <KeepAliveFrames frames={frames} activeProjectName={projectName} />
          {showPlaceholder && (
            <View
              className="items-center justify-center"
              style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(18,18,31,0.95)" }}
            >
              <PreviewPlaceholder
                isError={isError}
                projectName={projectName}
                lastPreviewError={lastPreviewError}
                status={status}
                isLoading={isLoading}
                isPreviewStarting={isPreviewStarting}
              />
            </View>
          )}
          {isWaking && (
            <View
              className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-full"
              style={{ position: "absolute", top: 8, right: 8, backgroundColor: "rgba(0,229,255,0.12)", borderWidth: 1, borderColor: "rgba(0,229,255,0.25)" }}
            >
              <Loader size={10} color="#00E5FF" strokeWidth={2} />
              <Text style={{ fontSize: 9, color: "#00E5FF", fontWeight: "600", letterSpacing: 0.5 }}>
                WAKING
              </Text>
            </View>
          )}
        </View>
      ) : previewSrc ? (
        <View className="flex-1">
          <NativePreviewSurface iframeSrc={previewSrc} />
        </View>
      ) : (
        <View className="flex-1 items-center justify-center">
          <PreviewPlaceholder
            isError={isError}
            projectName={projectName}
            lastPreviewError={lastPreviewError}
            status={status}
            isLoading={isLoading}
            isPreviewStarting={isPreviewStarting}
          />
        </View>
      )}
    </View>
  );
};

export default PreviewPanel;
