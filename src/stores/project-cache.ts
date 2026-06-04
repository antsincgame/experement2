// Per-project workspace cache: generation progress survives sidebar switches.
import type { GenerationFile, ProjectState } from "./project-store.types";
import { saveProjectChatPatch } from "./project-store.helpers";

export type ProjectWorkspaceCache = {
  plan: Record<string, unknown> | null;
  generationFiles: GenerationFile[];
  generationProgress: number;
  currentGeneratingFile: string | null;
  streamingContent: string;
};

export const DEFAULT_WORKSPACE_CACHE: ProjectWorkspaceCache = {
  plan: null,
  generationFiles: [],
  generationProgress: 0,
  currentGeneratingFile: null,
  streamingContent: "",
};

export const readProjectWorkspaceCache = (
  chats: ProjectState["projectChats"],
  projectName: string,
): ProjectWorkspaceCache => {
  const chat = chats[projectName];
  return {
    plan: chat?.plan ?? null,
    generationFiles: chat?.generationFiles ?? [],
    generationProgress: chat?.generationProgress ?? 0,
    currentGeneratingFile: chat?.currentGeneratingFile ?? null,
    streamingContent: chat?.streamingContent ?? "",
  };
};

/** Merge cache into projectChats; mirror into live state when that project is open. */
export const applyProjectWorkspaceCache = (
  state: ProjectState,
  projectName: string,
  patch: Partial<ProjectWorkspaceCache>,
): Partial<ProjectState> => {
  const projectChats = saveProjectChatPatch(state.projectChats, projectName, patch);
  if (state.projectName !== projectName) {
    return { projectChats };
  }
  return { ...patch, projectChats };
};
