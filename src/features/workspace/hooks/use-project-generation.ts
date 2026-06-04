// Resume UX: merges sidebar hint with authoritative agent status — one hook for the project screen.
import { useCallback, useEffect, useState } from "react";
import { createSystemMessage } from "@/features/chat/schemas/message.schema";
import { useWebSocket } from "@/shared/hooks/use-websocket";
import { apiClient, type ProjectResumeStatus } from "@/shared/lib/api-client";
import { isGenerationActive } from "@/shared/lib/generation-status";
import {
  isContinueGenerationMessage,
  resolveResumeProjectName,
} from "@/shared/lib/resume-flow";
import { useProjectStore } from "@/stores/project-store";

export const useProjectGeneration = (routeProjectName: string | null) => {
  const { resumeGeneration } = useWebSocket();
  const status = useProjectStore((state) => state.status);
  const storeProjectName = useProjectStore((state) => state.projectName);
  const projectList = useProjectStore((state) => state.projectList);
  const addMessage = useProjectStore((state) => state.addMessage);
  const addProject = useProjectStore((state) => state.addProject);
  const setStatus = useProjectStore((state) => state.setStatus);

  const resumeProjectName = resolveResumeProjectName(routeProjectName, storeProjectName);

  const [resumeStatus, setResumeStatus] = useState<ProjectResumeStatus | null>(null);
  const [isResuming, setIsResuming] = useState(false);

  const listHint = resumeProjectName
    ? projectList.find((p) => p.name === resumeProjectName)
    : undefined;

  const syncResumeStatus = useCallback((fetched: ProjectResumeStatus) => {
    setResumeStatus(fetched);
    if (!resumeProjectName) {
      return;
    }
    const existing = useProjectStore.getState().projectList.find((p) => p.name === resumeProjectName);
    if (existing) {
      addProject({
        ...existing,
        canResume: fetched.canResume,
        missingFileCount: fetched.missingFileCount,
      });
    }
  }, [addProject, resumeProjectName]);

  useEffect(() => {
    if (!resumeProjectName) {
      setResumeStatus(null);
      return;
    }

    if (listHint?.canResume === false) {
      setResumeStatus({
        canResume: false,
        hasSavedPlan: false,
        missingFileCount: 0,
        totalPlanFiles: 0,
      });
    }

    let cancelled = false;
    void apiClient
      .getProjectResumeStatus(resumeProjectName)
      .then((fetched) => {
        if (!cancelled) {
          syncResumeStatus(fetched);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResumeStatus(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [resumeProjectName, listHint?.canResume, syncResumeStatus]);

  useEffect(() => {
    if (!resumeProjectName || status !== "error") {
      return;
    }

    let cancelled = false;
    void apiClient
      .getProjectResumeStatus(resumeProjectName)
      .then((fetched) => {
        if (!cancelled) {
          syncResumeStatus(fetched);
        }
      })
      .catch(() => {
        /* keep last known status */
      });

    return () => {
      cancelled = true;
    };
  }, [resumeProjectName, status, syncResumeStatus]);

  useEffect(() => {
    if (!isResuming || isGenerationActive(status)) {
      return;
    }
    if (status === "ready") {
      setIsResuming(false);
      setResumeStatus((prev) =>
        prev ? { ...prev, canResume: false, missingFileCount: 0 } : prev,
      );
      return;
    }
    if (status === "error") {
      setIsResuming(false);
      if (resumeProjectName) {
        void apiClient.getProjectResumeStatus(resumeProjectName).then(syncResumeStatus).catch(() => undefined);
      }
    }
  }, [isResuming, resumeProjectName, status, syncResumeStatus]);

  const showResumeBanner = Boolean(
    resumeProjectName &&
    (resumeStatus?.canResume || listHint?.canResume),
  );

  const handleResumeGeneration = useCallback(() => {
    if (!resumeProjectName) {
      return;
    }
    setIsResuming(true);
    setStatus("generating");
    addMessage(createSystemMessage("↻ Resuming generation from saved plan…", false));
    resumeGeneration(resumeProjectName);
  }, [addMessage, resumeGeneration, resumeProjectName, setStatus]);

  const tryContinueFromChat = useCallback(
    (text: string): boolean => {
      if (!showResumeBanner && !resumeStatus?.canResume && !listHint?.canResume) {
        return false;
      }
      if (!isContinueGenerationMessage(text)) {
        return false;
      }
      handleResumeGeneration();
      return true;
    },
    [handleResumeGeneration, listHint?.canResume, resumeStatus?.canResume, showResumeBanner],
  );

  return {
    handleResumeGeneration,
    isResuming,
    resumeProjectName,
    resumeStatus,
    showResumeBanner,
    tryContinueFromChat,
  };
};
