// Resume UX: merges sidebar hint with authoritative agent status — one hook for the project screen.
import { useCallback, useEffect, useState } from "react";
import { createSystemMessage } from "@/features/chat/schemas/message.schema";
import { useWebSocket } from "@/shared/hooks/use-websocket";
import { apiClient, type ProjectResumeStatus } from "@/shared/lib/api-client";
import { isCreatingRoute } from "@/shared/lib/creation-flow";
import { isGenerationActive } from "@/shared/lib/generation-status";
import { useProjectStore } from "@/stores/project-store";

export const useProjectGeneration = (routeProjectName: string | null) => {
  const { resumeGeneration } = useWebSocket();
  const status = useProjectStore((state) => state.status);
  const projectList = useProjectStore((state) => state.projectList);
  const addMessage = useProjectStore((state) => state.addMessage);
  const setStatus = useProjectStore((state) => state.setStatus);

  const [resumeStatus, setResumeStatus] = useState<ProjectResumeStatus | null>(null);
  const [isResuming, setIsResuming] = useState(false);

  const listHint = routeProjectName
    ? projectList.find((p) => p.name === routeProjectName)
    : undefined;

  useEffect(() => {
    if (!routeProjectName || isCreatingRoute(routeProjectName)) {
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
      .getProjectResumeStatus(routeProjectName)
      .then((fetched) => {
        if (!cancelled) {
          setResumeStatus(fetched);
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
  }, [routeProjectName, listHint?.canResume]);

  useEffect(() => {
    if (!isResuming || isGenerationActive(status)) {
      return;
    }
    if (status === "ready" || status === "error") {
      setIsResuming(false);
      setResumeStatus((prev) =>
        prev ? { ...prev, canResume: false, missingFileCount: 0 } : prev,
      );
    }
  }, [isResuming, status]);

  const handleResumeGeneration = useCallback(() => {
    if (!routeProjectName || isCreatingRoute(routeProjectName)) {
      return;
    }
    setIsResuming(true);
    setStatus("generating");
    addMessage(createSystemMessage("↻ Resuming generation from saved plan…", false));
    resumeGeneration(routeProjectName);
  }, [addMessage, resumeGeneration, routeProjectName, setStatus]);

  return {
    handleResumeGeneration,
    isResuming,
    resumeStatus,
  };
};
