// Covers the pure project and preview store transitions that guard multi-project switching and hydration behavior.
import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../features/chat/schemas/message.schema";
import {
  applyProjectFileSnapshot,
  buildCreationStartState,
  buildPersistedProjectChats,
  buildProjectSwitchState,
  createEmptyChat,
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
  previewStatus: "ready",
  plan: null,
  messages: [createMessage("current alpha message")],
  fileTree: [{ name: "app.tsx", path: "app.tsx", type: "file" }],
  openFiles: ["app.tsx"],
  activeFile: "app.tsx",
  fileContents: { "app.tsx": "alpha" },
  fileDrafts: {},
  versions: [{ number: 1, hash: "abc1234", description: "init", timestamp: 1 }],
  currentVersion: 1,
  previewUrl: "http://localhost:3100/preview/alpha/",
  previewPort: 8081,
  previewBuildId: "11111111-1111-1111-1111-111111111111",
  previewRevision: 0,
  lastPreviewError: null,
  generationProgress: 0.8,
  currentGeneratingFile: "app.tsx",
  generationFiles: [],
  generationCheckpoint: null,
  isConnected: true,
  lmStudioStatus: "connected",
  pendingProjectName: null,
  pendingCreationRequestId: null,
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
  appendBackgroundMessage: () => undefined,
  updateLastAssistantMessage: () => undefined,
  setFileTree: () => undefined,
  openFile: () => undefined,
  closeFile: () => undefined,
  setActiveFile: () => undefined,
  setFileContent: () => undefined,
  setFileDraft: () => undefined,
  revertFileDraft: () => undefined,
  clearFileDraft: () => undefined,
  addVersion: () => undefined,
  setCurrentVersion: () => undefined,
  setPreview: () => undefined,
  setPreviewStatus: () => undefined,
  bumpPreviewRevision: () => undefined,
  setGenerationProgress: () => undefined,
  setConnected: () => undefined,
  setLmStudioStatus: () => undefined,
  setGenerationCheckpoint: () => undefined,
  setPendingProjectName: () => undefined,
  setPendingCreationRequestId: () => undefined,
  appendStreamingContent: () => undefined,
  ensurePlanDraftingMessage: () => undefined,
  applyPlanBriefToChat: () => undefined,
  appendReasoningMessage: () => undefined,
  syncProjectWorkspace: () => undefined,
  clearStreamingContent: () => undefined,
  startGenerationFile: () => undefined,
  appendGenerationCode: () => undefined,
  completeGenerationFile: () => undefined,
  completeFileMessage: () => undefined,
  resetGenerationFiles: () => undefined,
  toggleFileTree: () => undefined,
  toggleTerminal: () => undefined,
  addProject: () => undefined,
  removeProject: () => undefined,
  switchProject: () => undefined,
  beginCreation: () => undefined,
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

describe("buildCreationStartState", () => {
  it("drops a stale __creating__ chat and starts from an empty conversation", () => {
    const state = createState();
    state.projectName = "__creating__";
    state.messages = [createMessage("old failed creation message")];
    state.streamingContent = "stale stream";
    state.projectChats = {
      ...state.projectChats,
      __creating__: {
        messages: [createMessage("old failed creation message")],
        versions: [],
        fileTree: [],
        openFiles: [],
        activeFile: null,
        fileContents: {},
        streamingContent: "stale stream",
        previewUrl: null,
        previewPort: null,
      },
    };

    const next = buildCreationStartState(state);

    expect(next.projectName).toBe("__creating__");
    expect(next.status).toBe("planning");
    expect(next.plan).toBeNull();
    expect(next.messages).toEqual([]);
    expect(next.streamingContent).toBe("");
    expect(next.projectChats?.["__creating__"]?.messages).toEqual([]);
    // A real, unrelated project's chat is preserved.
    expect(next.projectChats?.beta?.messages).toEqual([createMessage("beta message")]);
  });
});

describe("buildPersistedProjectChats", () => {
  it("never persists the transient __creating__ placeholder chat", () => {
    const persisted = buildPersistedProjectChats({
      alpha: {
        messages: [createMessage("alpha")],
        versions: [],
        fileTree: [],
        openFiles: [],
        activeFile: null,
        fileContents: {},
        streamingContent: "",
        previewUrl: null,
        previewPort: null,
      },
      __creating__: {
        messages: [createMessage("in-flight creation")],
        versions: [],
        fileTree: [],
        openFiles: [],
        activeFile: null,
        fileContents: {},
        streamingContent: "",
        previewUrl: null,
        previewPort: null,
      },
    });

    expect(Object.keys(persisted)).toEqual(["alpha"]);
    expect(persisted.__creating__).toBeUndefined();
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

  it("restores the more advanced phase when list lags during __creating__ handoff", () => {
    const state = createState();
    state.projectName = "__creating__";
    state.status = "building";
    state.plan = { name: "beta" };
    state.projectList = [
      { name: "beta", displayName: "Beta", status: "scaffolding", port: null, createdAt: 2 },
    ];

    const nextState = buildProjectSwitchState(state, "beta");

    expect(nextState.status).toBe("building");
  });

  it("restores cached generation progress when returning to a project", () => {
    const state = createState();
    state.generationFiles = [{ path: "app/index.tsx", code: "", status: "streaming" }];
    state.generationProgress = 0.5;
    state.currentGeneratingFile = "app/index.tsx";
    state.projectChats = {
      ...state.projectChats,
      beta: {
        ...(state.projectChats.beta ?? createEmptyChat()),
        generationFiles: [{ path: "app/login.tsx", code: "x", status: "done" }],
        generationProgress: 1,
        currentGeneratingFile: null,
      },
    };

    const nextState = buildProjectSwitchState(state, "beta");

    expect(nextState.generationFiles).toEqual([
      { path: "app/login.tsx", code: "x", status: "done" },
    ]);
    expect(nextState.generationProgress).toBe(1);
    expect(nextState.projectChats?.alpha?.generationFiles).toEqual([
      { path: "app/index.tsx", code: "", status: "streaming" },
    ]);
  });
});
