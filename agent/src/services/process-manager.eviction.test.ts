// Ensures singleton Metro eviction broadcasts preview_status: stopped for other projects.
import { beforeEach, describe, expect, it, vi } from "vitest";

const broadcast = vi.fn();
const setPreviewPort = vi.fn();

vi.mock("../lib/event-bus.js", () => ({
  broadcast,
  setPreviewPort,
}));

vi.mock("./log-watcher.js", () => ({
  watchProcess: () => () => undefined,
}));

vi.mock("../lib/port-finder.js", () => ({
  findFreePort: vi
    .fn()
    .mockResolvedValueOnce(19001)
    .mockResolvedValueOnce(19002),
  isPortFree: vi.fn().mockResolvedValue(true),
}));

vi.mock("child_process", () => {
  const makeChild = () => ({
    pid: Math.floor(Math.random() * 10_000),
    killed: false,
    on: vi.fn(),
    once: vi.fn(),
    kill: vi.fn(),
  });
  return {
    spawn: vi.fn(() => makeChild()),
    spawnSync: vi.fn(() => ({ status: 0, stdout: "", stderr: "" })),
  };
});

describe("process-manager singleton eviction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("broadcasts preview stopped for the evicted project when another starts Metro", async () => {
    const mod = await import("./process-manager.js");
    const onLog = vi.fn();

    await mod.startExpo("alpha", "/tmp/alpha", onLog);
    broadcast.mockClear();
    setPreviewPort.mockClear();

    await mod.startExpo("beta", "/tmp/beta", onLog);

    expect(broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "preview_status",
        previewStatus: "stopped",
        projectName: "alpha",
      }),
    );
    expect(setPreviewPort).toHaveBeenCalledWith("alpha", null);
  });

  it("broadcasts preview stopped when killExpo is called", async () => {
    const mod = await import("./process-manager.js");
    const onLog = vi.fn();

    await mod.startExpo("alpha", "/tmp/alpha", onLog);
    broadcast.mockClear();

    mod.killExpo("alpha");

    expect(broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "preview_status",
        previewStatus: "stopped",
        projectName: "alpha",
      }),
    );
  });
});
