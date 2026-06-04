// Owns project-screen routing and preview orchestration so lifecycle and preview success stay decoupled.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { Linking } from "react-native";
import { createUserMessage } from "@/features/chat/schemas/message.schema";
import { useWebSocket } from "@/shared/hooks/use-websocket";
import { apiClient } from "@/shared/lib/api-client";
import { useProjectGeneration } from "./use-project-generation";
import { fetchProjectFiles, useProjectStore } from "@/stores/project-store";
import {
  getCreatingRouteSyncSlug,
  isCreatingRoute,
  isCreationSession,
} from "@/shared/lib/creation-flow";
import { isGenerationActive } from "@/shared/lib/generation-status";
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
  const setPendingProjectName = useProjectStore((state) => state.setPendingProjectName);
  const pendingProjectName = useProjectStore((state) => state.pendingProjectName);
  const plan = useProjectStore((state) => state.plan);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [showLotusToast, setShowLotusToast] = useState(false);
  const {
    resumeStatus,
    isResuming,
    handleResumeGeneration,
    showResumeBanner,
    resumeProjectName,
    tryContinueFromChat,
  } = useProjectGeneration(routeProjectName);
  const previousPreviewStatus = useRef(previewStatus);
  const previousPreviewBuildId = useRef<string | null>(previewBuildId);
  const activeProjectRef = useRef<string | null>(null);
  const previewRequestedRef = useRef<Set<string>>(new Set());

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

    const storeSnapshot = useProjectStore.getState();
    const requestedPreviews = previewRequestedRef.current;
    void openProjectWorkspace({
      allowEmptyFiles:
        isCreatingRoute(routeProjectName) ||
        isCreationSession({
          projectName: storeSnapshot.projectName,
          pendingProjectName: storeSnapshot.pendingProjectName,
        }) ||
        isGenerationActive(storeSnapshot.status),
      currentProjectName: storeSnapshot.projectName,
      projectName: routeProjectName,
      switchProject: storeSnapshot.switchProject,
      fetchProjectFiles,
      startPreview: (name) => {
        if (requestedPreviews.has(name)) {
          return;
        }
        requestedPreviews.add(name);
        startPreview(name);
      },
      onMissingProject: () => {
        activeProjectRef.current = null;
        router.replace("/");
      },
    });
  }, [routeProjectName, router, startPreview]);

  // After plan_complete, replace /project/__creating__ with the planned slug only.
  useEffect(() => {
    if (!isCreatingRoute(routeProjectName)) {
      return;
    }

    const syncSlug = getCreatingRouteSyncSlug({
      plan,
      projectName,
      pendingProjectName,
    });
    if (!syncSlug || routeProjectName === syncSlug) {
      return;
    }

    activeProjectRef.current = syncSlug;
    router.replace(`/project/${encodeURIComponent(syncSlug)}`);
  }, [pendingProjectName, plan, projectName, routeProjectName, router]);

  // On generation failure during creation, keep the user in the workspace so the
  // error message stays visible in chat. Only clear the in-flight marker so the
  // chat input re-enables and a retry can be started — never silently bounce home.
  useEffect(() => {
    if (
      status === "error" &&
      isCreationSession({ projectName, pendingProjectName }) &&
      pendingProjectName
    ) {
      setPendingProjectName(null);
    }
  }, [pendingProjectName, projectName, setPendingProjectName, status]);

  const handleChatSend = useCallback((text: string) => {
    addMessage(createUserMessage(text));
    if (tryContinueFromChat(text)) {
      return;
    }
    iterate(text);
  }, [addMessage, iterate, tryContinueFromChat]);

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
    handleResumeGeneration,
    handleSelectProject,
    isResuming,
    resumeStatus,
    showResumeBanner,
    resumeProjectName,
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
