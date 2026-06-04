// Extracts async workspace orchestration into testable helpers so screens stay declarative.
import { isCreatingRoute } from "@/shared/lib/creation-flow";
import type { ProjectListItem } from "@/shared/lib/api-client";
import type { AppStatus } from "@/stores/project-store.types";

interface HydrateStoredProjectsOptions {
  projects: ProjectListItem[];
  addProject: (project: {
    name: string;
    displayName: string;
    status: AppStatus;
    port: null;
    createdAt: number;
    canResume?: boolean;
    missingFileCount?: number;
  }) => void;
}

interface OpenProjectWorkspaceOptions {
  allowEmptyFiles?: boolean;
  currentProjectName: string | null;
  projectName: string;
  switchProject: (name: string) => void;
  fetchProjectFiles: (name: string) => Promise<Record<string, string> | null>;
  startPreview: (name: string) => void;
  onMissingProject: () => void;
}

export const hydrateStoredProjects = ({
  projects,
  addProject,
}: HydrateStoredProjectsOptions): void => {
  for (const project of projects) {
    addProject({
      name: project.name,
      displayName: project.displayName,
      status: (project.canResume ? "idle" : "ready") as AppStatus,
      port: null,
      createdAt: project.createdAt ?? Date.now(),
      canResume: project.canResume,
      missingFileCount: project.missingFileCount,
    });
  }
};

export const openProjectWorkspace = async ({
  allowEmptyFiles = false,
  currentProjectName,
  projectName,
  switchProject,
  fetchProjectFiles,
  startPreview,
  onMissingProject,
}: OpenProjectWorkspaceOptions): Promise<void> => {
  if (!projectName || projectName === currentProjectName) {
    return;
  }

  switchProject(projectName);

  if (isCreatingRoute(projectName)) {
    return;
  }

  try {
    const files = await fetchProjectFiles(projectName);
    if (!files || Object.keys(files).length === 0) {
      if (!allowEmptyFiles) {
        onMissingProject();
      }
      return;
    }

    startPreview(projectName);
  } catch {
    onMissingProject();
  }
};
