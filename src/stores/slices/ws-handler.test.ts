// Verifies that WebSocket reducer logic enforces strict project scoping and preview failure handling.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IncomingWsMessage } from "@/shared/schemas/ws-messages";
import type { ProjectState } from "../project-store.types";
import { createWsHandler } from "./ws-handler";

const addErrorLog = vi.fn();

vi.mock("@/stores/settings-store", () => ({
  useSettingsStore: {
    getState: () => ({
      addErrorLog,
    }),
  },
}));

vi.mock("@/features/chat/schemas/message.schema", () => ({
  createAssistantMessage: (content: string) => ({
    id: `assistant:${content}`,
    role: "assistant",
    content,
    timestamp: Date.now(),
    status: "complete",
  }),
  createSystemMessage: (content: string, isHidden = false) => ({
    id: `system:${content}`,
    role: "assistant",
    content,
    timestamp: Date.now(),
    status: "complete",
    isHidden,
  }),
  createErrorMessage: (content: string, errorDetails?: string, file?: string) => ({
    id: `error:${content}`,
    role: "assistant",
    content,
    timestamp: Date.now(),
    status: "error",
    isError: true,
    errorDetails,
    file,
  }),
}));

const REQUEST_ID = "7f34af80-790f-42d7-8ff5-5de444ce7127";
const BUILD_ID = "11111111-1111-4111-8111-111111111111";

const createHarness = () => {
  let state: ProjectState;

  const setState = (updater: Partial<ProjectState> | ((state: ProjectState) => Partial<ProjectState>)) => {
    const partial = typeof updater === "function" ? updater(state) : updater;
    state = { ...state, ...partial };
  };

  state = {
    projectName: "alpha",
    projectList: [{ name: "alpha", displayName: "Alpha", status: "ready", port: null, createdAt: 1 }],
    status: "ready",
    previewStatus: "stopped",
    plan: null,
    messages: [],
    fileTree: [],
    openFiles: [],
    activeFile: null,
    fileContents: {},
    versions: [],
    currentVersion: 0,
    previewUrl: null,
    previewPort: null,
    previewBuildId: null,
    previewRevision: 0,
    lastPreviewError: null,
    generationProgress: 0,
    currentGeneratingFile: null,
    isConnected: true,
    lmStudioStatus: "connected",
    pendingProjectName: null,
    streamingContent: "",
    fileTreeVisible: true,
    terminalVisible: true,
    projectChats: {},
    setProjectName: (projectName) => setState({ projectName }),
    setStatus: (status) => setState({ status }),
    setPlan: (plan) => setState({ plan }),
    addMessage: (message) => setState((current) => ({ messages: [...current.messages, message] })),
    updateLastAssistantMessage: () => undefined,
    setFileTree: (fileTree) => setState({ fileTree }),
    openFile: () => undefined,
    closeFile: () => undefined,
    setActiveFile: (activeFile) => setState({ activeFile }),
    setFileContent: (path, content) => setState((current) => ({
      fileContents: { ...current.fileContents, [path]: content },
    })),
    addVersion: (version) => setState((current) => ({ versions: [...current.versions, version] })),
    setCurrentVersion: (currentVersion) => setState({ currentVersion }),
    setPreview: (previewUrl, previewPort) => setState({ previewUrl, previewPort }),
    setPreviewStatus: (previewStatus, options) => setState({
      previewStatus,
      previewBuildId: options?.buildId ?? null,
      lastPreviewError: options?.error ?? null,
    }),
    bumpPreviewRevision: () => setState((current) => ({ previewRevision: current.previewRevision + 1 })),
    setGenerationProgress: (generationProgress, currentGeneratingFile) =>
      setState({ generationProgress, currentGeneratingFile }),
    setConnected: (isConnected) => setState({ isConnected }),
    setLmStudioStatus: (lmStudioStatus) => setState({ lmStudioStatus }),
    setPendingProjectName: (pendingProjectName) => setState({ pendingProjectName }),
    appendStreamingContent: (chunk) => setState((current) => ({ streamingContent: current.streamingContent + chunk })),
    clearStreamingContent: () => setState({ streamingContent: "" }),
    toggleFileTree: () => undefined,
    toggleTerminal: () => undefined,
    addProject: (entry) => setState((current) => ({ projectList: [...current.projectList, entry] })),
    removeProject: () => undefined,
    switchProject: () => undefined,
    reset: () => undefined,
    handleWsMessage: () => undefined,
  };

  const handler = createWsHandler(
    (updater) => setState(updater as Parameters<typeof setState>[0]),
    () => state,
    vi.fn().mockResolvedValue(undefined)
  );

  return {
    getState: () => state,
    handle: (message: IncomingWsMessage) => handler(message),
  };
};

describe("createWsHandler", () => {
  beforeEach(() => {
    addErrorLog.mockReset();
  });

  it("ignores unscoped build events when a project is active", () => {
    const harness = createHarness();

    harness.handle({
      type: "build_event",
      requestId: REQUEST_ID,
      eventType: "build_success",
    });

    expect(harness.getState().previewStatus).toBe("stopped");
    expect(addErrorLog).toHaveBeenCalledWith({
      level: "warn",
      source: "ws",
      message: "Ignored unscoped build event: build_success",
    });
  });

  it("clears stale preview state when preview status becomes error", () => {
    const harness = createHarness();
    harness.getState().setPreview("http://localhost:3100/preview/alpha/", 8081);

    harness.handle({
      type: "preview_status",
      requestId: REQUEST_ID,
      projectName: "alpha",
      buildId: BUILD_ID,
      previewStatus: "error",
      error: "Metro crashed",
    });

    expect(harness.getState().previewStatus).toBe("error");
    expect(harness.getState().lastPreviewError).toBe("Metro crashed");
    expect(harness.getState().previewBuildId).toBe(BUILD_ID);
    expect(harness.getState().previewUrl).toBeNull();
    expect(harness.getState().previewPort).toBeNull();
  });

  it("stores preview metadata when preview becomes ready", () => {
    const harness = createHarness();

    harness.handle({
      type: "preview_ready",
      requestId: REQUEST_ID,
      projectName: "alpha",
      buildId: BUILD_ID,
      port: 8081,
      proxyUrl: "/preview/alpha/",
    });

    expect(harness.getState().status).toBe("ready");
    expect(harness.getState().previewStatus).toBe("ready");
    expect(harness.getState().previewBuildId).toBe(BUILD_ID);
    expect(harness.getState().previewUrl).toBe("/preview/alpha/");
    expect(harness.getState().previewPort).toBe(8081);
  });

  it("treats iteration errors as terminal failures and clears preview", () => {
    const harness = createHarness();
    harness.getState().setPreview("http://localhost:3100/preview/alpha/", 8081);

    harness.handle({
      type: "iteration_complete",
      requestId: REQUEST_ID,
      projectName: "alpha",
      applied: 1,
      failed: 0,
      errors: ["TypeScript failed"],
    });

    expect(harness.getState().status).toBe("error");
    expect(harness.getState().previewStatus).toBe("error");
    expect(harness.getState().previewUrl).toBeNull();
    expect(harness.getState().previewPort).toBeNull();
  });
});
