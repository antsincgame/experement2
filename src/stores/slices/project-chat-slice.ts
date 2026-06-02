// Extracts chat and version mutations so project-store no longer owns every domain action inline.
import type { ChatMessage } from "@/features/chat/schemas/message.schema";
import type { GenerationFile, ProjectStoreSet, Version } from "../project-store.types";
import { saveProjectChatPatch } from "../project-store.helpers";

// Per-file code preview is transient; cap it so a runaway stream cannot exhaust memory.
const MAX_GENERATION_FILE_CHARS = 24_000;

export const createProjectChatSlice = (set: ProjectStoreSet) => ({
  addMessage: (message: ChatMessage) =>
    set((state) => {
      const nextMessages = [...state.messages, message];
      const messages = nextMessages.length > 200
        ? nextMessages.slice(-200)
        : nextMessages;

      return {
        messages,
        projectChats: saveProjectChatPatch(state.projectChats, state.projectName, {
          messages,
        }),
      };
    }),

  updateLastAssistantMessage: (content: string) =>
    set((state) => {
      const messages = [...state.messages];
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        if (messages[index].role !== "assistant") {
          continue;
        }

        messages[index] = {
          ...messages[index],
          content,
          status: "streaming",
        };
        break;
      }

      return {
        messages,
        projectChats: saveProjectChatPatch(state.projectChats, state.projectName, {
          messages,
        }),
      };
    }),

  addVersion: (version: Version) =>
    set((state) => {
      const versions = [...state.versions, version];
      return {
        versions,
        currentVersion: version.number,
        projectChats: saveProjectChatPatch(state.projectChats, state.projectName, {
          versions,
        }),
      };
    }),

  setCurrentVersion: (currentVersion: number) => set({ currentVersion }),

  appendStreamingContent: (chunk: string) =>
    set((state) => {
      const nextStreamingContent = state.streamingContent + chunk;
      return {
        streamingContent: nextStreamingContent.length > 4_000
          ? nextStreamingContent.slice(-4_000)
          : nextStreamingContent,
      };
    }),

  clearStreamingContent: () =>
    set((state) => ({
      streamingContent: "",
      projectChats: saveProjectChatPatch(state.projectChats, state.projectName, {
        streamingContent: "",
      }),
    })),

  startGenerationFile: (path: string) =>
    set((state) => {
      const existing = state.generationFiles.find((file) => file.path === path);
      if (existing) {
        return {
          generationFiles: state.generationFiles.map((file) =>
            file.path === path ? { ...file, status: "streaming" as const } : file
          ),
        };
      }
      const entry: GenerationFile = { path, code: "", status: "streaming" };
      return { generationFiles: [...state.generationFiles, entry] };
    }),

  appendGenerationCode: (chunk: string) =>
    set((state) => {
      const files = state.generationFiles;
      const lastIndex = files.length - 1;
      if (lastIndex < 0) {
        return {};
      }
      const target = files[lastIndex];
      const merged = (target.code + chunk).slice(-MAX_GENERATION_FILE_CHARS);
      const generationFiles = [...files];
      generationFiles[lastIndex] = { ...target, code: merged };
      return { generationFiles };
    }),

  completeGenerationFile: (path: string) =>
    set((state) => ({
      generationFiles: state.generationFiles.map((file) =>
        file.path === path ? { ...file, status: "done" as const } : file
      ),
    })),

  resetGenerationFiles: () => set({ generationFiles: [] }),
});
