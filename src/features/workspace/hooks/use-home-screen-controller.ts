// Moves welcome-screen orchestration out of the route so project loading and actions stay reusable.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { createUserMessage } from "@/features/chat/schemas/message.schema";
import { useWebSocket } from "@/shared/hooks/use-websocket";
import { apiClient, type ProjectListItem } from "@/shared/lib/api-client";
import { useProjectStore } from "@/stores/project-store";
import { useSettingsStore } from "@/stores/settings-store";
import {
  CREATING_PENDING_KEY,
  CREATING_PROJECT_SLUG,
  isCreatingRoute,
} from "@/shared/lib/creation-flow";
import { isGenerationActive } from "@/shared/lib/generation-status";
import { hydrateStoredProjects } from "./workspace-flow";

export const useHomeScreenController = () => {
  const router = useRouter();
  const { createProject } = useWebSocket();
  const projectName = useProjectStore((state) => state.projectName);
  const projectList = useProjectStore((state) => state.projectList);
  const status = useProjectStore((state) => state.status);
  const lmStudioStatus = useProjectStore((state) => state.lmStudioStatus);
  const isConnected = useProjectStore((state) => state.isConnected);
  const addMessage = useProjectStore((state) => state.addMessage);
  const addProject = useProjectStore((state) => state.addProject);
  const reset = useProjectStore((state) => state.reset);
  const setPendingProjectName = useProjectStore((state) => state.setPendingProjectName);
  const setPendingCreationRequestId = useProjectStore((state) => state.setPendingCreationRequestId);
  const beginCreation = useProjectStore((state) => state.beginCreation);
  const setProjectName = useProjectStore((state) => state.setProjectName);
  const setStatus = useProjectStore((state) => state.setStatus);
  const enhancerEnabled = useSettingsStore((state) => state.enhancerEnabled);
  const enhancerModel = useSettingsStore((state) => state.enhancerModel);
  const generationModel = useSettingsStore((state) => state.model);
  const agentUrl = useSettingsStore((state) => state.agentUrl);
  const lmStudioUrl = useSettingsStore((state) => state.lmStudioUrl);
  const pendingProjectName = useProjectStore((state) => state.pendingProjectName);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [welcomeInput, setWelcomeInput] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [enhanceError, setEnhanceError] = useState<string | null>(null);
  const [creationError, setCreationError] = useState<string | null>(null);
  const [diskProjects, setDiskProjects] = useState<ProjectListItem[]>([]);
  const enhanceErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // A creation can fail with only the placeholder slug still active (the
    // project-screen effect clears pendingProjectName but leaves projectName as
    // "__creating__"), so reset on EITHER marker — otherwise the "homeless"
    // placeholder lingers and the next creation inherits it.
    const stuckCreation =
      pendingProjectName === CREATING_PENDING_KEY || projectName === CREATING_PROJECT_SLUG;
    if (status === "error" && stuckCreation) {
      const lastError = useProjectStore.getState().messages
        .filter(m => m.isError).at(-1);
      setCreationError(lastError?.content.slice(0, 200) ?? "Project creation failed");
      setPendingProjectName(null);
      setPendingCreationRequestId(null);
      setProjectName(null);
      setStatus("idle");
      // Creation failed before a real project existed: leave the /project/__creating__
      // placeholder route so the user lands back on a functional home screen.
      if (isCreatingRoute(useProjectStore.getState().projectName) || projectName === CREATING_PROJECT_SLUG) {
        router.replace("/");
      }
    } else if (status !== "error") {
      setCreationError(null);
    }
  }, [status, pendingProjectName, projectName, router, setPendingCreationRequestId, setPendingProjectName, setProjectName, setStatus]);

  useEffect(() => {
    const loadProjects = async (): Promise<void> => {
      try {
        const projects = await apiClient.listProjects();
        setDiskProjects(projects);
        hydrateStoredProjects({ projects, addProject });
      } catch {
        useSettingsStore.getState().addErrorLog({ level: "warn", source: "home-screen", message: "Failed to list projects" });
      }
    };

    void loadProjects();
  }, [addProject, agentUrl]);

  useEffect(() => () => {
    if (enhanceErrorTimerRef.current) {
      clearTimeout(enhanceErrorTimerRef.current);
    }
  }, [enhanceErrorTimerRef]);

  const allProjects = useMemo(() => (
    projectList.length > 0
      ? projectList
      : diskProjects.map((project) => ({
        ...project,
        status: "ready" as const,
        port: null,
        createdAt: project.createdAt ?? Date.now(),
      }))
  ), [diskProjects, projectList]);

  const handleEnhance = useCallback(async () => {
    const trimmed = welcomeInput.trim();
    if (!trimmed) {
      return;
    }

    setEnhancing(true);
    setEnhanceError(null);
    try {
      const improvedPrompt = await apiClient.enhancePrompt({
        prompt: trimmed,
        model: enhancerModel.trim() || generationModel.trim() || undefined,
        lmStudioUrl,
      });
      const trimmedResult = improvedPrompt.trim();
      if (trimmedResult) {
        setWelcomeInput(trimmedResult);
      } else {
        const msg =
          "Модель вернула пустой ответ — проверьте, что в LM Studio загружена chat-модель, а не только embedding.";
        setEnhanceError(msg);
        useSettingsStore.getState().addErrorLog({ level: "warn", source: "enhance", message: msg });
        if (enhanceErrorTimerRef.current) {
          clearTimeout(enhanceErrorTimerRef.current);
        }
        enhanceErrorTimerRef.current = setTimeout(() => {
          setEnhanceError(null);
          enhanceErrorTimerRef.current = null;
        }, 6_000);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Enhancement failed";
      setEnhanceError(msg);
      useSettingsStore.getState().addErrorLog({ level: "error", source: "enhance", message: msg });
      if (enhanceErrorTimerRef.current) {
        clearTimeout(enhanceErrorTimerRef.current);
      }
      enhanceErrorTimerRef.current = setTimeout(() => {
        setEnhanceError(null);
        enhanceErrorTimerRef.current = null;
      }, 4_000);
    } finally {
      setEnhancing(false);
    }
  }, [enhanceErrorTimerRef, enhancerModel, generationModel, lmStudioUrl, welcomeInput]);

  const isCreating =
    pendingProjectName === CREATING_PENDING_KEY || isGenerationActive(status);

  const handleCreate = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isCreating) {
      return;
    }

    // Clean slate: clears any stale "__creating__" chat and resets the workspace
    // (also sets plan=null, status="planning") so the new project never inherits a
    // previous failed creation's conversation.
    beginCreation();
    setPendingProjectName(CREATING_PENDING_KEY);
    addMessage(createUserMessage(trimmed));
    // Scope this creation's WS events by its requestId so a previous run's late
    // events can't hijack the new session.
    const requestId = createProject(trimmed);
    setPendingCreationRequestId(requestId);
    router.replace(`/project/${encodeURIComponent(CREATING_PROJECT_SLUG)}`);
  }, [
    addMessage,
    beginCreation,
    createProject,
    isCreating,
    router,
    setPendingProjectName,
    setPendingCreationRequestId,
  ]);

  const handleOpenProject = useCallback((name: string) => {
    router.push(`/project/${encodeURIComponent(name)}`);
  }, [router]);

  const handleClearAll = useCallback(async () => {
    reset();
    setDiskProjects([]);

    try {
      await apiClient.deleteAllProjects();
    } catch {
      useSettingsStore.getState().addErrorLog({ level: "warn", source: "home-screen", message: "Failed to clear projects" });
    }
  }, [reset]);

  return {
    allProjects,
    creationError,
    enhanceError,
    enhancing,
    enhancerEnabled,
    handleClearAll,
    handleCreate,
    handleEnhance,
    handleOpenProject,
    inputFocused,
    isConnected,
    isCreating,
    lmStudioStatus,
    settingsVisible,
    setInputFocused,
    setSettingsVisible,
    setWelcomeInput,
    welcomeInput,
  };
};
