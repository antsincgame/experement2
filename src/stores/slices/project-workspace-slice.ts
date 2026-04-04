// Isolates file tree and preview mutations so workspace state can evolve independently from project metadata.
import type {
  FileNode,
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
      projectChats: saveProjectChatPatch(state.projectChats, state.projectName, {
        previewUrl,
        previewPort,
      }),
    })),

  setGenerationProgress: (
    generationProgress: number,
    currentGeneratingFile: string | null
  ) => set({ generationProgress, currentGeneratingFile }),

  toggleFileTree: () =>
    set((state) => ({ fileTreeVisible: !state.fileTreeVisible })),

  toggleTerminal: () =>
    set((state) => ({ terminalVisible: !state.terminalVisible })),
});
