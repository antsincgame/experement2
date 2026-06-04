// Verifies that WebSocket reducer logic enforces strict project scoping and preview failure handling.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IncomingWsMessage } from "@/shared/schemas/ws-messages";
import type { ProjectChat, ProjectState } from "../project-store.types";
import { createWsHandler } from "./ws-handler";
import { resolveChatTargetProject } from "./ws-scope";

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
  createReasoningMessage: (thinking: string) => ({
    id: `reasoning:${thinking}`,
    role: "assistant",
    content: thinking,
    thinking,
    timestamp: Date.now(),
    status: "complete",
  }),
  createDiffMessage: (filepath: string, before: string, after: string) => ({
    id: `diff:${filepath}`,
    role: "assistant",
    content: filepath,
    timestamp: Date.now(),
    status: "complete",
    diffFilepath: filepath,
    diffBefore: before,
    diffAfter: after,
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
  createProcessMessage: (kind: string, content: string) => ({
    id: `process:${kind}:${content}`,
    role: "assistant",
    content,
    timestamp: Date.now(),
    status: "complete",
    processKind: kind,
  }),
  createPlanStreamMessage: (chunk: string) => ({
    id: "plan-stream",
    role: "assistant",
    content: chunk,
    timestamp: Date.now(),
    status: "streaming",
    processKind: "plan",
  }),
  appendPlanStreamContent: (message: { content: string }, chunk: string) => ({
    ...message,
    content: message.content + chunk,
    status: "streaming",
  }),
}));

const REQUEST_ID = "7f34af80-790f-42d7-8ff5-5de444ce7127";
const FOREIGN_REQUEST_ID = "9a9a9a9a-1111-4222-8333-444444444444";
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
    fileDrafts: {},
    versions: [],
    currentVersion: 0,
    previewUrl: null,
    previewPort: null,
    previewBuildId: null,
    previewRevision: 0,
    lastPreviewError: null,
    generationProgress: 0,
    currentGeneratingFile: null,
    generationFiles: [],
    isConnected: true,
    lmStudioStatus: "connected",
    pendingProjectName: null,
    pendingCreationRequestId: null,
    streamingContent: "",
    fileTreeVisible: true,
    terminalVisible: true,
    projectChats: {},
    setProjectName: (projectName) => setState({ projectName }),
    setStatus: (status) => setState({ status }),
    setPlan: (plan) => setState({ plan }),
    addMessage: (message) => setState((current) => ({ messages: [...current.messages, message] })),
    appendBackgroundMessage: (projectName, message) => setState((current) => {
      if (!projectName || projectName === current.projectName) {
        return { messages: [...current.messages, message] };
      }
      const existing = current.projectChats[projectName];
      const messages = [...(existing?.messages ?? []), message];
      return {
        projectChats: {
          ...current.projectChats,
          [projectName]: { ...(existing ?? {}), messages } as ProjectChat,
        },
      };
    }),
    updateLastAssistantMessage: () => undefined,
    setFileTree: (fileTree) => setState({ fileTree }),
    openFile: () => undefined,
    closeFile: () => undefined,
    setActiveFile: (activeFile) => setState({ activeFile }),
    setFileContent: (path, content) => setState((current) => ({
      fileContents: { ...current.fileContents, [path]: content },
    })),
    setFileDraft: (path, content) => setState((current) => ({
      fileDrafts: { ...current.fileDrafts, [path]: content },
    })),
    revertFileDraft: (path) => setState((current) => {
      const { [path]: _removed, ...fileDrafts } = current.fileDrafts;
      return { fileDrafts };
    }),
    clearFileDraft: (path) => setState((current) => {
      const { [path]: _removed, ...fileDrafts } = current.fileDrafts;
      return { fileDrafts };
    }),
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
    setPendingCreationRequestId: (pendingCreationRequestId) => setState({ pendingCreationRequestId }),
    appendStreamingContent: (chunk) => setState((current) => ({ streamingContent: current.streamingContent + chunk })),
    ensurePlanDraftingMessage: () => setState((current) => {
      if (current.messages.some((m) => m.processKind === "plan")) {
        return {};
      }
      return {
        messages: [
          ...current.messages,
          {
            id: "plan-draft",
            role: "assistant" as const,
            content: "Drafting the blueprint…",
            processKind: "plan" as const,
            status: "streaming" as const,
            timestamp: 1,
          },
        ],
      };
    }),
    applyPlanBriefToChat: (plan, planBrief) => setState((current) => ({
      messages: [
        ...current.messages.filter((m) => m.processKind !== "plan"),
        {
          id: "plan-brief",
          role: "assistant" as const,
          content: planBrief ?? String((plan as { displayName?: string }).displayName ?? "Plan"),
          processKind: "plan" as const,
          status: "complete" as const,
          timestamp: 1,
        },
      ],
    })),
    clearStreamingContent: () => setState({ streamingContent: "" }),
    startGenerationFile: (path) => setState((current) => ({
      generationFiles: current.generationFiles.some((f) => f.path === path)
        ? current.generationFiles
        : [...current.generationFiles, { path, code: "", status: "streaming" as const }],
    })),
    appendGenerationCode: (chunk) => setState((current) => {
      if (current.generationFiles.length === 0) return {};
      const files = [...current.generationFiles];
      const last = files[files.length - 1];
      files[files.length - 1] = { ...last, code: last.code + chunk };
      return { generationFiles: files };
    }),
    completeGenerationFile: (path) => setState((current) => ({
      generationFiles: current.generationFiles.map((f) =>
        f.path === path ? { ...f, status: "done" as const } : f
      ),
    })),
    resetGenerationFiles: () => setState({ generationFiles: [] }),
    completeFileMessage: () => undefined,
    syncProjectWorkspace: (name, patch) => setState((current) => ({
      projectChats: {
        ...current.projectChats,
        [name]: { ...(current.projectChats[name] ?? {}), ...patch },
      },
      ...(current.projectName === name ? patch : {}),
    })),
    appendReasoningMessage: (thinking: string, target?: string | null) => {
      setState((current) => {
        const name = target ?? current.projectName;
        if (!name) {
          return {};
        }
        const entry = {
          id: `r:${thinking}`,
          role: "assistant" as const,
          content: "",
          thinking,
          timestamp: 1,
          status: "complete" as const,
        };
        if (name === current.projectName) {
          return {
            messages: [...current.messages, entry],
            projectChats: {
              ...current.projectChats,
              [name]: {
                ...(current.projectChats[name] ?? { messages: [] }),
                messages: [...(current.projectChats[name]?.messages ?? []), entry],
              },
            },
          };
        }
        return {
          projectChats: {
            ...current.projectChats,
            [name]: {
              ...(current.projectChats[name] ?? { messages: [] }),
              messages: [...(current.projectChats[name]?.messages ?? []), entry],
            },
          },
        };
      });
    },
    toggleFileTree: () => undefined,
    toggleTerminal: () => undefined,
    addProject: (entry) => setState((current) => ({ projectList: [...current.projectList, entry] })),
    removeProject: () => undefined,
    switchProject: () => undefined,
    beginCreation: () => undefined,
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

  it("attributes unscoped build events to the active project", () => {
    const harness = createHarness();

    harness.handle({
      type: "build_event",
      requestId: REQUEST_ID,
      eventType: "build_success",
    });

    expect(harness.getState().previewStatus).toBe("stopped");
    expect(harness.getState().messages.some((m) => m.processKind === "build")).toBe(true);
    expect(addErrorLog).toHaveBeenCalledWith({
      level: "info",
      source: "metro",
      message: "Build success",
    });
  });

  it("mirrors scoped build_event into chat as a process message", () => {
    const harness = createHarness();

    harness.handle({
      type: "build_event",
      requestId: REQUEST_ID,
      projectName: "alpha",
      eventType: "moe_swap",
      message: "Planner: test-model",
    });

    expect(harness.getState().messages.some((m) => m.content.includes("Planner: test-model"))).toBe(true);
  });

  it("keeps raw build_log out of chat but still logs it (quiet success)", () => {
    const harness = createHarness();

    harness.handle({
      type: "build_event",
      requestId: REQUEST_ID,
      projectName: "alpha",
      eventType: "build_log",
      message: "metro stdout noise line 1",
    });

    expect(harness.getState().messages.some((m) => m.content.includes("metro stdout noise"))).toBe(false);
    expect(addErrorLog).toHaveBeenCalledWith({
      level: "info",
      source: "metro",
      message: "metro stdout noise line 1",
    });
  });

  it("shows a drafting placeholder during planning instead of raw JSON", () => {
    const harness = createHarness();
    harness.getState().setStatus("planning");

    harness.handle({
      type: "plan_chunk",
      requestId: REQUEST_ID,
      projectName: "alpha",
      chunk: '{"name":"secret-app"}',
    });

    const planMessage = harness.getState().messages.find((m) => m.processKind === "plan");
    expect(planMessage?.content).toContain("Drafting the blueprint");
    expect(planMessage?.content).not.toContain("secret-app");
    expect(planMessage?.status).toBe("streaming");
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

  it("mirrors a background project's chat events into its cache without touching the active chat", () => {
    const harness = createHarness();

    // alpha is active; an event arrives for beta (a project generating in the background)
    harness.handle({
      type: "thinking",
      requestId: REQUEST_ID,
      projectName: "beta",
      content: "Designing beta",
    });

    // active chat untouched
    expect(harness.getState().messages).toHaveLength(0);
    // beta's cached chat received the reasoning message
    const betaMessages = harness.getState().projectChats.beta?.messages ?? [];
    expect(betaMessages).toHaveLength(1);
    expect(betaMessages[0].thinking).toBe("Designing beta");
  });

  it("resolveChatTargetProject falls back to creation placeholder slug", () => {
    const harness = createHarness();
    harness.getState().setProjectName("__creating__");

    const resolved = resolveChatTargetProject(() => harness.getState(), {
      type: "thinking",
      content: "x",
    } as IncomingWsMessage);

    expect(resolved).toBe("__creating__");
  });

  it("appends to the active chat when the event matches the active project", () => {
    const harness = createHarness();

    harness.handle({
      type: "thinking",
      requestId: REQUEST_ID,
      projectName: "alpha",
      content: "Designing alpha",
    });

    expect(harness.getState().messages).toHaveLength(1);
    expect(harness.getState().messages[0].thinking).toBe("Designing alpha");
  });

  it("updates sidebar status for a background project without changing the active view", () => {
    const harness = createHarness();
    harness.getState().addProject({
      name: "beta",
      displayName: "Beta",
      status: "generating",
      port: null,
      createdAt: 2,
    });

    harness.handle({
      type: "status",
      requestId: REQUEST_ID,
      projectName: "beta",
      status: "ready",
    });

    expect(harness.getState().status).toBe("ready");
    expect(harness.getState().projectList.find((p) => p.name === "beta")?.status).toBe("ready");
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

  // ── Creation-session scoping (H1) ──
  const startCreationSession = (harness: ReturnType<typeof createHarness>) => {
    harness.getState().setProjectName("__creating__");
    harness.getState().setPendingProjectName("__creating__");
    harness.getState().setPendingCreationRequestId(REQUEST_ID);
    harness.getState().setStatus("planning");
  };

  it("ignores a stale event from a previous run during creation (foreign requestId)", () => {
    const harness = createHarness();
    startCreationSession(harness);

    // A late event from an OLD run (different requestId) must not mutate status.
    harness.handle({
      type: "status",
      requestId: FOREIGN_REQUEST_ID,
      projectName: "old-project",
      status: "generating",
    });

    expect(harness.getState().status).toBe("planning");
  });

  it("accepts events from THIS creation (matching requestId)", () => {
    const harness = createHarness();
    startCreationSession(harness);

    harness.handle({
      type: "status",
      requestId: REQUEST_ID,
      projectName: "my-app",
      status: "generating",
    });

    expect(harness.getState().status).toBe("generating");
  });

  // ── project_created gate (H2) ──
  it("ignores project_created from a foreign requestId while creating", () => {
    const harness = createHarness();
    startCreationSession(harness);
    harness.getState().setPlan({ name: "my-app" });

    harness.handle({
      type: "project_created",
      requestId: FOREIGN_REQUEST_ID,
      projectName: "old-project",
      port: 8081,
    });

    expect(harness.getState().projectName).toBe("__creating__");
  });

  it("ignores project_created that arrives before the plan is ready", () => {
    const harness = createHarness();
    startCreationSession(harness); // plan stays null

    harness.handle({
      type: "project_created",
      requestId: REQUEST_ID,
      projectName: "old-project",
      port: 8081,
    });

    expect(harness.getState().projectName).toBe("__creating__");
  });

  it("accepts project_created for the planned project of this creation", () => {
    const harness = createHarness();
    startCreationSession(harness);
    harness.getState().setPlan({ name: "my-app" });

    harness.handle({
      type: "project_created",
      requestId: REQUEST_ID,
      projectName: "my-app",
      port: 8081,
    });

    expect(harness.getState().projectName).toBe("my-app");
  });
});
