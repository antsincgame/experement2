// Extracts chat and version mutations so project-store no longer owns every domain action inline.
import type { ChatMessage } from "@/features/chat/schemas/message.schema";
import type { ProjectStoreSet, Version } from "../project-store.types";
import { saveProjectChatPatch } from "../project-store.helpers";

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
});
