// Verifies preview restart resolves orphaned Metro ports and emits the full reload contract.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActivePort: vi.fn(),
  getPreviewPort: vi.fn(),
  setPreviewPort: vi.fn(),
  isRunning: vi.fn(),
  killExpo: vi.fn(),
  startExpoClearCache: vi.fn(),
  triggerMetroBuild: vi.fn(),
  waitForMetroReady: vi.fn(),
}));

vi.mock("./event-bus.js", () => ({
  getPreviewPort: mocks.getPreviewPort,
  setPreviewPort: mocks.setPreviewPort,
}));

vi.mock("../services/process-manager.js", () => ({
  getActivePort: mocks.getActivePort,
  isRunning: mocks.isRunning,
  killExpo: mocks.killExpo,
  startExpoClearCache: mocks.startExpoClearCache,
}));

vi.mock("./metro-ready.js", () => ({
  triggerMetroBuild: mocks.triggerMetroBuild,
  waitForMetroReady: mocks.waitForMetroReady,
}));

const { resolveTrackedPreviewPort, restartProjectPreview } = await import("./preview-restart.js");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getActivePort.mockReturnValue(null);
  mocks.getPreviewPort.mockReturnValue(null);
  mocks.isRunning.mockReturnValue(false);
  mocks.startExpoClearCache.mockResolvedValue({ port: 8081 });
  mocks.triggerMetroBuild.mockResolvedValue(undefined);
  mocks.waitForMetroReady.mockResolvedValue(true);
});

describe("resolveTrackedPreviewPort", () => {
  it("prefers the active process handle over the announced preview port", () => {
    mocks.getActivePort.mockReturnValue(8081);
    mocks.getPreviewPort.mockReturnValue(9090);

    expect(resolveTrackedPreviewPort("demo")).toBe(8081);
  });

  it("falls back to the announced preview port when the handle is missing", () => {
    mocks.getActivePort.mockReturnValue(null);
    mocks.getPreviewPort.mockReturnValue(9090);

    expect(resolveTrackedPreviewPort("demo")).toBe(9090);
  });
});

describe("restartProjectPreview", () => {
  it("is a no-op when no preview port is tracked", async () => {
    const emit = vi.fn();

    const result = await restartProjectPreview("demo", "/tmp/demo", emit);

    expect(result).toEqual({ restarted: false, port: null });
    expect(emit).not.toHaveBeenCalled();
    expect(mocks.killExpo).not.toHaveBeenCalled();
  });

  it("restarts Metro and emits preview_ready plus build_success", async () => {
    mocks.getActivePort.mockReturnValue(8081);
    const emit = vi.fn();

    const result = await restartProjectPreview("demo", "/tmp/demo", emit);

    expect(result).toEqual({ restarted: true, port: 8081 });
    expect(mocks.killExpo).toHaveBeenCalledWith("demo");
    expect(mocks.startExpoClearCache).toHaveBeenCalledWith(
      "demo",
      "/tmp/demo",
      8081,
      expect.any(Function)
    );
    expect(mocks.setPreviewPort).toHaveBeenCalledWith("demo", 8081);
    expect(mocks.waitForMetroReady).toHaveBeenCalledWith(8081, 60);

    const eventTypes = emit.mock.calls.map(([message]) => message.type);
    expect(eventTypes).toContain("reloading_preview");
    expect(eventTypes).toContain("preview_ready");
    expect(
      emit.mock.calls.some(
        ([message]) =>
          message.type === "build_event" && message.eventType === "build_success"
      )
    ).toBe(true);
  });

  it("uses the event-bus port when the agent lost the ChildProcess handle", async () => {
    mocks.getPreviewPort.mockReturnValue(9090);
    const emit = vi.fn();

    await restartProjectPreview("demo", "/tmp/demo", emit);

    expect(mocks.startExpoClearCache).toHaveBeenCalledWith(
      "demo",
      "/tmp/demo",
      9090,
      expect.any(Function)
    );
  });

  it("uses knownPortHint when killExpo already cleared the port registry", async () => {
    const emit = vi.fn();

    const result = await restartProjectPreview("demo", "/tmp/demo", emit, 9090);

    expect(result.restarted).toBe(true);
    expect(mocks.startExpoClearCache).toHaveBeenCalledWith(
      "demo",
      "/tmp/demo",
      9090,
      expect.any(Function)
    );
    expect(mocks.getActivePort).not.toHaveBeenCalled();
    expect(mocks.getPreviewPort).not.toHaveBeenCalled();
  });
});
