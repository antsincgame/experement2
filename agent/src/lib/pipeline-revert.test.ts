// Integration coverage for revertVersion's WS sequence: hash validation, git revert,
// Metro restart, and the terminal status branches. git + Metro restart are mocked; the
// real GIT_HASH_PATTERN and withRouting run.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  broadcast: vi.fn(),
  killExpo: vi.fn(),
  getProjectPath: vi.fn((name: string) => `/tmp/${name}`),
  resolveTrackedPreviewPort: vi.fn(),
  restartProjectPreview: vi.fn(),
  runGitCommand: vi.fn(),
}));

vi.mock("./event-bus.js", async (orig) => ({
  ...(await orig<typeof import("./event-bus.js")>()),
  broadcast: mocks.broadcast,
}));
vi.mock("../services/process-manager.js", async (orig) => ({
  ...(await orig<typeof import("../services/process-manager.js")>()),
  killExpo: mocks.killExpo,
}));
vi.mock("../services/file-manager.js", async (orig) => ({
  ...(await orig<typeof import("../services/file-manager.js")>()),
  getProjectPath: mocks.getProjectPath,
}));
vi.mock("./preview-restart.js", async (orig) => ({
  ...(await orig<typeof import("./preview-restart.js")>()),
  resolveTrackedPreviewPort: mocks.resolveTrackedPreviewPort,
  restartProjectPreview: mocks.restartProjectPreview,
}));
vi.mock("./git.js", async (orig) => ({
  ...(await orig<typeof import("./git.js")>()),
  runGitCommand: mocks.runGitCommand,
}));

const { revertVersion } = await import("./pipeline.js");

const HASH = "a1b2c3d4";

/** Outbound message `type`s captured from broadcast, in order. */
const emittedTypes = (): string[] =>
  mocks.broadcast.mock.calls.map(([message]) => (message as { type: string }).type);
const emitted = (type: string): Record<string, unknown> | undefined =>
  mocks.broadcast.mock.calls.map(([m]) => m as Record<string, unknown>).find((m) => m.type === type);

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks keeps implementations — reset runGitCommand so a prior test's
  // throw doesn't leak into the next (defaults to a no-op success).
  mocks.runGitCommand.mockReset();
  mocks.resolveTrackedPreviewPort.mockReturnValue(8081);
  mocks.restartProjectPreview.mockResolvedValue({ restarted: true, port: 8081 });
});

describe("revertVersion", () => {
  it("rejects an invalid commit hash before touching git or Metro", async () => {
    await revertVersion("demo", "not a hash!");

    expect(emitted("system_error")?.error).toMatch(/Invalid commit hash/);
    expect(mocks.killExpo).not.toHaveBeenCalled();
    expect(mocks.runGitCommand).not.toHaveBeenCalled();
    expect(mocks.restartProjectPreview).not.toHaveBeenCalled();
  });

  it("kills Metro, cleans + checks out the commit, then restarts the preview (happy path)", async () => {
    await revertVersion("demo", HASH, undefined, "11111111-1111-4111-8111-111111111111");

    // Metro released BEFORE git mutates the tree (Windows file locks).
    expect(mocks.killExpo).toHaveBeenCalledWith("demo");
    expect(mocks.runGitCommand).toHaveBeenNthCalledWith(1, "/tmp/demo", ["clean", "-fd"]);
    expect(mocks.runGitCommand).toHaveBeenNthCalledWith(2, "/tmp/demo", ["checkout", HASH, "--", "."]);
    // Restart uses the port captured BEFORE killExpo cleared the registry.
    expect(mocks.restartProjectPreview).toHaveBeenCalledWith(
      "demo",
      "/tmp/demo",
      expect.any(Function),
      8081,
    );
    // Terminal status on success.
    const status = emitted("status");
    expect(status).toMatchObject({ status: "ready", previewStatus: "ready" });
    // requestId is threaded onto outbound messages by withRouting.
    expect(status?.requestId).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("surfaces a git failure as system_error and does not restart", async () => {
    mocks.runGitCommand.mockImplementation((_path: string, args: string[]) => {
      if (args[0] === "checkout") throw new Error("checkout conflict");
    });

    await revertVersion("demo", HASH);

    expect(emitted("system_error")?.error).toMatch(/Git revert failed: checkout conflict/);
    expect(mocks.restartProjectPreview).not.toHaveBeenCalled();
  });

  it("reports the preview stopped when the restart finds no port to revive", async () => {
    mocks.resolveTrackedPreviewPort.mockReturnValue(null);
    mocks.restartProjectPreview.mockResolvedValue({ restarted: false, port: null });

    await revertVersion("demo", HASH);

    expect(emittedTypes()).toContain("preview_status");
    expect(emitted("preview_status")?.previewStatus).toBe("stopped");
    expect(emitted("status")?.status).toBe("ready");
  });
});
