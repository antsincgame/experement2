// Isolates file tree and preview mutations so workspace and preview runtime can evolve independently.
import type {
  FileNode,
  PreviewStatus,
  ProjectStoreSet,
} from "../project-store.types";
import {
  limitFileContents,
  saveProjectChatPatch,
  MAX_CACHED_FILES,
} from "../project-store.helpers";

const buildTrimmedFileContents = (
  fileContents: Record<string, string>,
  path: string,
  content: string
): Record<string, string> => {
  const mergedFileContents = { ...fileContents, [path]: content };
  if (Object.keys(mergedFileContents).length <= MAX_CACHED_FILES) {
    return mergedFileContents;
  }

  return limitFileContents(mergedFileContents);
};

export const createProjectWorkspaceSlice = (set: ProjectStoreSet) => ({
  setFileTree: (fileTree: FileNode[]) =>
    set((state) => ({
      fileTree,
      projectChats: saveProjectChatPatch(state.projectChats, state.projectName, {
        fileTree,
      }),
    })),

  openFile: (path: string) =>
    set((state) => {
      const openFiles = state.openFiles.includes(path)
        ? state.openFiles
        : [...state.openFiles, path];

      return {
        openFiles,
        activeFile: path,
        projectChats: saveProjectChatPatch(state.projectChats, state.projectName, {
          openFiles,
          activeFile: path,
        }),
      };
    }),

  closeFile: (path: string) =>
    set((state) => {
      const openFiles = state.openFiles.filter((filePath) => filePath !== path);
      const activeFile = state.activeFile === path
        ? (openFiles[openFiles.length - 1] ?? null)
        : state.activeFile;

      return {
        openFiles,
        activeFile,
        projectChats: saveProjectChatPatch(state.projectChats, state.projectName, {
          openFiles,
          activeFile,
        }),
      };
    }),

  setActiveFile: (activeFile: string | null) =>
    set((state) => ({
      activeFile,
      projectChats: saveProjectChatPatch(state.projectChats, state.projectName, {
        activeFile,
      }),
    })),

  setFileContent: (path: string, content: string) =>
    set((state) => {
      const fileContents = buildTrimmedFileContents(state.fileContents, path, content);
      return {
        fileContents,
        projectChats: saveProjectChatPatch(state.projectChats, state.projectName, {
          fileContents,
        }),
      };
    }),

  setPreview: (previewUrl: string | null, previewPort: number | null) =>
    set((state) => ({
      previewUrl,
      previewPort,
      ...(previewUrl ? { lastPreviewError: null } : {}),
      projectChats: saveProjectChatPatch(state.projectChats, state.projectName, {
        previewUrl,
        previewPort,
      }),
    })),

  setPreviewStatus: (
    previewStatus: PreviewStatus,
    options?: { error?: string | null; buildId?: string | null }
  ) =>
    set({
      previewStatus,
      lastPreviewError: options?.error ?? null,
      previewBuildId: options?.buildId ?? null,
    }),

  bumpPreviewRevision: () =>
    set((state) => ({ previewRevision: state.previewRevision + 1 })),

  setGenerationProgress: (
    generationProgress: number,
    currentGeneratingFile: string | null
  ) => set({ generationProgress, currentGeneratingFile }),

  toggleFileTree: () =>
    set((state) => ({ fileTreeVisible: !state.fileTreeVisible })),

  toggleTerminal: () =>
    set((state) => ({ terminalVisible: !state.terminalVisible })),
});
