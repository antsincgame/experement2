// Extracts chat and version mutations so project-store no longer owns every domain action inline.
import {
  appendPlanStreamContent,
  createPlanStreamMessage,
  createReasoningMessage,
  type ChatMessage,
} from "@/features/chat/schemas/message.schema";
import {
  applyProjectWorkspaceCache,
  readProjectWorkspaceCache,
  type ProjectWorkspaceCache,
} from "../project-cache";
import type { GenerationFile, ProjectStoreSet, Version } from "../project-store.types";
import { createEmptyChat, saveProjectChatPatch } from "../project-store.helpers";

const MAX_GENERATION_FILE_CHARS = 24_000;
const MAX_MESSAGES = 200;
const MAX_PERSISTED_THINKING_CHARS = 16_000;

const trimMessages = (messages: ChatMessage[]): ChatMessage[] =>
  messages.length > MAX_MESSAGES ? messages.slice(-MAX_MESSAGES) : messages;

const upsertPlanStream = (messages: ChatMessage[], chunk: string): ChatMessage[] => {
  const next = [...messages];
  let planIndex = -1;
  for (let index = next.length - 1; index >= 0; index -= 1) {
    const entry = next[index];
    if (entry.processKind === "plan" && entry.status === "streaming") {
      planIndex = index;
      break;
    }
  }
  if (planIndex >= 0) {
    next[planIndex] = appendPlanStreamContent(next[planIndex], chunk);
  } else {
    next.push(createPlanStreamMessage(chunk));
  }
  return trimMessages(next);
};

const upsertReasoning = (messages: ChatMessage[], thinking: string): ChatMessage[] => {
  const next = [...messages];
  const last = next[next.length - 1];
  const header = thinking.split("\n")[0] ?? "";
  if (
    last?.role === "assistant"
    && last.thinking
    && last.content.trim() === ""
    && header.length > 0
    && last.thinking.startsWith(header)
  ) {
    next[next.length - 1] = {
      ...last,
      thinking: thinking.slice(-MAX_PERSISTED_THINKING_CHARS),
    };
    return trimMessages(next);
  }
  return trimMessages([
    ...next,
    {
      ...createReasoningMessage(thinking.slice(-MAX_PERSISTED_THINKING_CHARS)),
    },
  ]);
};

const updateGenerationFiles = (
  files: GenerationFile[],
  path: string,
  updater: (file: GenerationFile) => GenerationFile,
): GenerationFile[] => {
  const existing = files.find((file) => file.path === path);
  if (existing) {
    return files.map((file) => (file.path === path ? updater(file) : file));
  }
  return [...files, { path, code: "", status: "streaming" as const }];
};

export const createProjectChatSlice = (set: ProjectStoreSet) => ({
  addMessage: (message: ChatMessage) =>
    set((state) => {
      const nextMessages = trimMessages([...state.messages, message]);
      return {
        messages: nextMessages,
        projectChats: saveProjectChatPatch(state.projectChats, state.projectName, {
          messages: nextMessages,
        }),
      };
    }),

  appendBackgroundMessage: (projectName: string, message: ChatMessage) =>
    set((state) => {
      if (!projectName || projectName === state.projectName) {
        const messages = trimMessages([...state.messages, message]);
        return {
          messages,
          projectChats: saveProjectChatPatch(state.projectChats, state.projectName, {
            messages,
          }),
        };
      }
      const existing = state.projectChats[projectName]?.messages ?? [];
      const messages = trimMessages([...existing, message]);
      return {
        projectChats: saveProjectChatPatch(state.projectChats, projectName, { messages }),
      };
    }),

  /**
   * Find the last "file" process message for this filepath in the active chat and
   * update its content in-place (Writing → ✓). Falls back to appending if not found.
   */
  completeFileMessage: (filepath: string, targetProject?: string | null) =>
    set((state) => {
      const target = targetProject ?? state.projectName;
      if (!target) return {};

      const updateMessages = (msgs: ChatMessage[]): ChatMessage[] => {
        const next = [...msgs];
        for (let i = next.length - 1; i >= 0; i--) {
          const m = next[i];
          if (m.processKind === "file" && m.content.includes(`\`${filepath}\``)) {
            next[i] = { ...m, content: `✓ \`${filepath}\``, status: "complete" };
            return next;
          }
        }
        // Fallback: just append a done message.
        return trimMessages([...next, {
          id: crypto.randomUUID(),
          role: "assistant" as const,
          content: `✓ \`${filepath}\``,
          timestamp: Date.now(),
          status: "complete" as const,
          processKind: "file" as const,
        }]);
      };

      if (target === state.projectName) {
        const messages = updateMessages(state.messages);
        return {
          messages,
          projectChats: saveProjectChatPatch(state.projectChats, target, { messages }),
        };
      }
      const chat = state.projectChats[target];
      if (!chat) return {};
      const messages = updateMessages(chat.messages);
      return { projectChats: saveProjectChatPatch(state.projectChats, target, { messages }) };
    }),

  appendReasoningMessage: (thinking: string, targetProject?: string | null) =>
    set((state) => {
      const target = targetProject ?? state.projectName;
      if (!target) {
        return {};
      }
      if (target === state.projectName) {
        const messages = upsertReasoning(state.messages, thinking);
        return {
          messages,
          projectChats: saveProjectChatPatch(state.projectChats, target, { messages }),
        };
      }
      const chat = state.projectChats[target] ?? createEmptyChat();
      const messages = upsertReasoning(chat.messages, thinking);
      return {
        projectChats: saveProjectChatPatch(state.projectChats, target, { messages }),
      };
    }),

  syncProjectWorkspace: (projectName: string, patch: Partial<ProjectWorkspaceCache>) =>
    set((state) => applyProjectWorkspaceCache(state, projectName, patch)),

  updateLastAssistantMessage: (content: string) =>
    set((state) => {
      const messages = [...state.messages];
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        if (messages[index].role !== "assistant") {
          continue;
        }
        messages[index] = { ...messages[index], content, status: "streaming" };
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
      const streamingContent = nextStreamingContent.length > 4_000
        ? nextStreamingContent.slice(-4_000)
        : nextStreamingContent;
      return { streamingContent };
    }),

  appendPlanStreamChunk: (chunk: string, targetProject?: string | null) =>
    set((state) => {
      const target = targetProject ?? state.projectName;
      if (!target) {
        return {};
      }

      const nextStreaming = (readProjectWorkspaceCache(state.projectChats, target).streamingContent + chunk)
        .slice(-4_000);

      if (target === state.projectName) {
        const messages = upsertPlanStream(state.messages, chunk);
        return {
          messages,
          streamingContent: nextStreaming,
          projectChats: saveProjectChatPatch(state.projectChats, target, {
            messages,
            streamingContent: nextStreaming,
          }),
        };
      }

      const chat = state.projectChats[target] ?? createEmptyChat();
      const messages = upsertPlanStream(chat.messages, chunk);
      const projectChats = saveProjectChatPatch(state.projectChats, target, {
        messages,
        streamingContent: nextStreaming,
      });
      return { projectChats };
    }),

  finalizePlanStream: (targetProject?: string | null) =>
    set((state) => {
      const target = targetProject ?? state.projectName;
      if (!target) {
        return {};
      }

      const finalize = (messages: ChatMessage[]): ChatMessage[] => {
        const next = [...messages];
        for (let index = next.length - 1; index >= 0; index -= 1) {
          const entry = next[index];
          if (entry.processKind === "plan" && entry.status === "streaming") {
            next[index] = { ...entry, status: "complete" };
            break;
          }
        }
        return next;
      };

      if (target === state.projectName) {
        const messages = finalize(state.messages);
        return {
          messages,
          projectChats: saveProjectChatPatch(state.projectChats, target, { messages }),
        };
      }

      const chat = state.projectChats[target] ?? createEmptyChat();
      const messages = finalize(chat.messages);
      return {
        projectChats: saveProjectChatPatch(state.projectChats, target, { messages }),
      };
    }),

  clearStreamingContent: () =>
    set((state) => ({
      streamingContent: "",
      projectChats: saveProjectChatPatch(state.projectChats, state.projectName, {
        streamingContent: "",
      }),
    })),

  startGenerationFile: (path: string, targetProject?: string | null) =>
    set((state) => {
      const target = targetProject ?? state.projectName;
      if (!target) {
        return {};
      }
      const cache = readProjectWorkspaceCache(state.projectChats, target);
      const generationFiles = updateGenerationFiles(cache.generationFiles, path, (file) => ({
        ...file,
        status: "streaming",
      }));
      return applyProjectWorkspaceCache(state, target, { generationFiles });
    }),

  appendGenerationCode: (chunk: string, targetProject?: string | null) =>
    set((state) => {
      const target = targetProject ?? state.projectName;
      if (!target) {
        return {};
      }
      const cache = readProjectWorkspaceCache(state.projectChats, target);
      const files = cache.generationFiles;
      const lastIndex = files.length - 1;
      if (lastIndex < 0) {
        return {};
      }
      const file = files[lastIndex];
      const generationFiles = [...files];
      generationFiles[lastIndex] = {
        ...file,
        code: (file.code + chunk).slice(-MAX_GENERATION_FILE_CHARS),
      };
      return applyProjectWorkspaceCache(state, target, { generationFiles });
    }),

  completeGenerationFile: (path: string, targetProject?: string | null) =>
    set((state) => {
      const target = targetProject ?? state.projectName;
      if (!target) {
        return {};
      }
      const cache = readProjectWorkspaceCache(state.projectChats, target);
      const generationFiles = cache.generationFiles.map((file) =>
        file.path === path ? { ...file, status: "done" as const } : file
      );
      return applyProjectWorkspaceCache(state, target, { generationFiles });
    }),

  resetGenerationFiles: () =>
    set((state) => {
      if (!state.projectName) {
        return { generationFiles: [] };
      }
      return applyProjectWorkspaceCache(state, state.projectName, {
        generationFiles: [],
        generationProgress: 0,
        currentGeneratingFile: null,
      });
    }),
});
