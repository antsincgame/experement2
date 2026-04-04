// Covers the pure project-store transitions that guard multi-project switching and hydration behavior.
import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../features/chat/schemas/message.schema";
import {
  applyProjectFileSnapshot,
  buildProjectSwitchState,
} from "./project-store.helpers";
import type { ProjectState } from "./project-store.types";

const createMessage = (content: string): ChatMessage => ({
  id: content,
  role: "assistant",
  content,
  timestamp: 1,
  status: "complete",
});

const createState = (): ProjectState => ({
  projectName: "alpha",
  projectList: [
    { name: "alpha", displayName: "Alpha", status: "generating", port: null, createdAt: 1 },
    { name: "beta", displayName: "Beta", status: "ready", port: null, createdAt: 2 },
  ],
  status: "generating",
  plan: null,
  messages: [createMessage("current alpha message")],
  fileTree: [{ name: "app.tsx", path: "app.tsx", type: "file" }],
  openFiles: ["app.tsx"],
  activeFile: "app.tsx",
  fileContents: { "app.tsx": "alpha" },
  versions: [{ number: 1, hash: "abc1234", description: "init", timestamp: 1 }],
  currentVersion: 1,
  previewUrl: "http://localhost:3100/preview/alpha/",
  previewPort: 8081,
  generationProgress: 0.8,
  currentGeneratingFile: "app.tsx",
  isConnected: true,
  lmStudioStatus: "connected",
  pendingProjectName: null,
  streamingContent: "stream",
  fileTreeVisible: true,
  terminalVisible: true,
  projectChats: {
    beta: {
      messages: [createMessage("beta message")],
      versions: [],
      fileTree: [{ name: "beta.tsx", path: "beta.tsx", type: "file" }],
      openFiles: ["beta.tsx"],
      activeFile: "beta.tsx",
      fileContents: { "beta.tsx": "beta" },
      streamingContent: "",
      previewUrl: "http://localhost:3100/preview/beta/",
      previewPort: 8082,
    },
  },
  setProjectName: () => undefined,
  setStatus: () => undefined,
  setPlan: () => undefined,
  addMessage: () => undefined,
  updateLastAssistantMessage: () => undefined,
  setFileTree: () => undefined,
  openFile: () => undefined,
  closeFile: () => undefined,
  setActiveFile: () => undefined,
  setFileContent: () => undefined,
  addVersion: () => undefined,
  setCurrentVersion: () => undefined,
  setPreview: () => undefined,
  setGenerationProgress: () => undefined,
  setConnected: () => undefined,
  setLmStudioStatus: () => undefined,
  setPendingProjectName: () => undefined,
  appendStreamingContent: () => undefined,
  clearStreamingContent: () => undefined,
  toggleFileTree: () => undefined,
  toggleTerminal: () => undefined,
  addProject: () => undefined,
  removeProject: () => undefined,
  switchProject: () => undefined,
  reset: () => undefined,
  handleWsMessage: () => undefined,
});

describe("applyProjectFileSnapshot", () => {
  it("updates active project files and tree in one pass", () => {
    const state = createState();
    const snapshot = applyProjectFileSnapshot(
      state,
      "alpha",
      [{ name: "index.tsx", path: "index.tsx", type: "file" }],
      { "index.tsx": "next" }
    );

    expect(snapshot.fileTree).toEqual([{ name: "index.tsx", path: "index.tsx", type: "file" }]);
    expect(snapshot.fileContents).toEqual({
      "index.tsx": "next",
    });
  });
});

describe("buildProjectSwitchState", () => {
  it("persists current project state before restoring the selected workspace", () => {
    const state = createState();
    const nextState = buildProjectSwitchState(state, "beta");

    expect(nextState.projectName).toBe("beta");
    expect(nextState.messages).toEqual([createMessage("beta message")]);
    expect(nextState.previewUrl).toBeNull();
    expect(nextState.projectChats?.alpha?.messages).toEqual([
      createMessage("current alpha message"),
    ]);
    expect(nextState.projectChats?.alpha?.fileContents).toEqual({
      "app.tsx": "alpha",
    });
  });
});
