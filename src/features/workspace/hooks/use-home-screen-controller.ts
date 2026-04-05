// Moves welcome-screen orchestration out of the route so project loading and actions stay reusable.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { createUserMessage } from "@/features/chat/schemas/message.schema";
import { useWebSocket } from "@/shared/hooks/use-websocket";
import { apiClient, type ProjectListItem } from "@/shared/lib/api-client";
import { useProjectStore } from "@/stores/project-store";
import { useSettingsStore } from "@/stores/settings-store";
import { hydrateStoredProjects } from "./workspace-flow";

export const useHomeScreenController = () => {
  const router = useRouter();
  const { createProject } = useWebSocket();
  const projectName = useProjectStore((state) => state.projectName);
  const projectList = useProjectStore((state) => state.projectList);
  const status = useProjectStore((state) => state.status);
  const isConnected = useProjectStore((state) => state.isConnected);
  const addMessage = useProjectStore((state) => state.addMessage);
  const addProject = useProjectStore((state) => state.addProject);
  const reset = useProjectStore((state) => state.reset);
  const setPendingProjectName = useProjectStore((state) => state.setPendingProjectName);
  const setProjectName = useProjectStore((state) => state.setProjectName);
  const setStatus = useProjectStore((state) => state.setStatus);
  const enhancerEnabled = useSettingsStore((state) => state.enhancerEnabled);
  const enhancerModel = useSettingsStore((state) => state.enhancerModel);
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

  useEffect(() => {
    if (projectName && status !== "idle") {
      router.push(`/project/${encodeURIComponent(projectName)}`);
    }
  }, [projectName, router, status]);

  useEffect(() => {
    if (status === "error" && pendingProjectName === "__creating__" && !projectName) {
      const lastError = useProjectStore.getState().messages
        .filter(m => m.isError).at(-1);
      setCreationError(lastError?.content.slice(0, 200) ?? "Project creation failed");
      setPendingProjectName(null);
      setStatus("idle");
    } else if (status !== "error") {
      setCreationError(null);
    }
  }, [status, pendingProjectName, projectName, setPendingProjectName, setStatus]);

  useEffect(() => {
    const loadProjects = async (): Promise<void> => {
      try {
        const projects = await apiClient.listProjects();
        setDiskProjects(projects);
        hydrateStoredProjects({ projects, addProject });
      } catch (error) {
        console.warn("[home-screen] Failed to list projects", error);
      }
    };

    void loadProjects();
  }, [addProject, agentUrl]);

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
        model: enhancerModel || undefined,
        lmStudioUrl,
      });
      if (improvedPrompt) {
        setWelcomeInput(improvedPrompt);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Enhancement failed";
      setEnhanceError(msg);
      useSettingsStore.getState().addErrorLog({ level: "error", source: "enhance", message: msg });
      setTimeout(() => setEnhanceError(null), 4_000);
    } finally {
      setEnhancing(false);
    }
  }, [enhancerModel, lmStudioUrl, welcomeInput]);

  const handleCreate = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    addMessage(createUserMessage(trimmed));
    setProjectName(null);
    setPendingProjectName("__creating__");
    setStatus("planning");
    createProject(trimmed);
  }, [addMessage, createProject, setPendingProjectName, setProjectName, setStatus]);

  const handleOpenProject = useCallback((name: string) => {
    router.push(`/project/${encodeURIComponent(name)}`);
  }, [router]);

  const handleClearAll = useCallback(async () => {
    reset();
    setDiskProjects([]);

    try {
      await apiClient.deleteAllProjects();
    } catch (error) {
      console.warn("[home-screen] Failed to clear projects", error);
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
    settingsVisible,
    setInputFocused,
    setSettingsVisible,
    setWelcomeInput,
    welcomeInput,
  };
};
