// Extracts async workspace orchestration into testable helpers so screens stay declarative.
import type { ProjectListItem } from "@/shared/lib/api-client";

interface HydrateStoredProjectsOptions {
  projects: ProjectListItem[];
  addProject: (project: {
    name: string;
    displayName: string;
    status: "ready";
    port: null;
    createdAt: number;
  }) => void;
}

interface OpenProjectWorkspaceOptions {
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
      status: "ready",
      port: null,
      createdAt: project.createdAt ?? Date.now(),
    });
  }
};

export const openProjectWorkspace = async ({
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

  try {
    const files = await fetchProjectFiles(projectName);
    if (!files || Object.keys(files).length === 0) {
      onMissingProject();
      return;
    }

    startPreview(projectName);
  } catch {
    onMissingProject();
  }
};
