// Owns project-screen routing and preview orchestration so lifecycle and preview success stay decoupled.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { Linking } from "react-native";
import { createUserMessage } from "@/features/chat/schemas/message.schema";
import { useWebSocket } from "@/shared/hooks/use-websocket";
import { apiClient } from "@/shared/lib/api-client";
import { fetchProjectFiles, useProjectStore } from "@/stores/project-store";
import { openProjectWorkspace } from "./workspace-flow";

export const useProjectScreenController = (routeProjectName: string | null) => {
  const router = useRouter();
  const { iterate, abortGeneration, revertVersion, startPreview } = useWebSocket();
  const projectName = useProjectStore((state) => state.projectName);
  const projectList = useProjectStore((state) => state.projectList);
  const status = useProjectStore((state) => state.status);
  const fileTree = useProjectStore((state) => state.fileTree);
  const openFiles = useProjectStore((state) => state.openFiles);
  const activeFile = useProjectStore((state) => state.activeFile);
  const fileTreeVisible = useProjectStore((state) => state.fileTreeVisible);
  const terminalVisible = useProjectStore((state) => state.terminalVisible);
  const generationProgress = useProjectStore((state) => state.generationProgress);
  const currentGeneratingFile = useProjectStore((state) => state.currentGeneratingFile);
  const previewBuildId = useProjectStore((state) => state.previewBuildId);
  const previewStatus = useProjectStore((state) => state.previewStatus);
  const addMessage = useProjectStore((state) => state.addMessage);
  const openFile = useProjectStore((state) => state.openFile);
  const closeFile = useProjectStore((state) => state.closeFile);
  const removeProject = useProjectStore((state) => state.removeProject);
  const setActiveFile = useProjectStore((state) => state.setActiveFile);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [showLotusToast, setShowLotusToast] = useState(false);
  const previousPreviewStatus = useRef(previewStatus);
  const previousPreviewBuildId = useRef<string | null>(previewBuildId);
  const activeProjectRef = useRef<string | null>(null);

  useEffect(() => {
    const hasFreshPreview = previewBuildId !== null && previewBuildId !== previousPreviewBuildId.current;
    if (
      previousPreviewStatus.current !== "ready" &&
      previewStatus === "ready" &&
      projectName &&
      hasFreshPreview
    ) {
      setShowLotusToast(true);
    }
    previousPreviewStatus.current = previewStatus;
    previousPreviewBuildId.current = previewBuildId;
  }, [previewBuildId, previewStatus, projectName]);

  // Open project workspace — fires ONLY when route changes, NOT when store updates.
  // Uses ref to prevent infinite loop: switchProject updates store.projectName,
  // which would re-trigger this effect if projectName were in the dependency array.
  useEffect(() => {
    if (!routeProjectName || routeProjectName === activeProjectRef.current) {
      return;
    }

    activeProjectRef.current = routeProjectName;

    void openProjectWorkspace({
      currentProjectName: useProjectStore.getState().projectName,
      projectName: routeProjectName,
      switchProject: useProjectStore.getState().switchProject,
      fetchProjectFiles,
      startPreview,
      onMissingProject: () => {
        activeProjectRef.current = null;
        router.replace("/");
      },
    });
  }, [routeProjectName, router, startPreview]);

  const handleChatSend = useCallback((text: string) => {
    addMessage(createUserMessage(text));
    iterate(text);
  }, [addMessage, iterate]);

  const handleSelectProject = useCallback((selectedName: string) => {
    router.push(`/project/${encodeURIComponent(selectedName)}`);
  }, [router]);

  const handleCreateNew = useCallback(() => {
    router.replace("/");
  }, [router]);

  const handleExport = useCallback(() => {
    if (!projectName) {
      return;
    }

    void Linking.openURL(apiClient.getProjectExportUrl(projectName));
  }, [projectName]);

  return {
    abortGeneration,
    activeFile,
    closeFile,
    currentGeneratingFile,
    fileTree,
    fileTreeVisible,
    generationProgress,
    handleChatSend,
    handleCreateNew,
    handleExport,
    handleSelectProject,
    openFile,
    openFiles,
    projectList,
    projectName,
    removeProject,
    revertVersion,
    routeProjectName,
    setActiveFile,
    setSettingsVisible,
    settingsVisible,
    setShowLotusToast,
    showLotusToast,
    status,
    terminalVisible,
  };
};
