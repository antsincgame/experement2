// Multiple project previews stay live at once (multi-Metro), bounded by a memory
// budget: only the MAX_LIVE_PREVIEWS most-recently-used are kept, the LRU is evicted
// when a new start exceeds the budget, and touchPreview protects the viewed one.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const broadcast = vi.fn();
const setPreviewPort = vi.fn();

vi.mock("../lib/event-bus.js", () => ({
  broadcast,
  setPreviewPort,
}));

vi.mock("./log-watcher.js", () => ({
  watchProcess: () => () => undefined,
}));

let nextPort = 19001;
vi.mock("../lib/port-finder.js", () => ({
  findFreePort: vi.fn(() => Promise.resolve(nextPort++)),
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

const stoppedFor = (name: string): unknown =>
  expect.objectContaining({ type: "preview_status", previewStatus: "stopped", projectName: name });

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  nextPort = 19001;
});

afterEach(() => {
  delete process.env.MAX_LIVE_PREVIEWS;
});

describe("process-manager multi-Metro previews", () => {
  it("keeps other projects' previews alive while within the budget", async () => {
    process.env.MAX_LIVE_PREVIEWS = "3";
    const mod = await import("./process-manager.js");
    const onLog = vi.fn();

    await mod.startExpo("alpha", "/tmp/alpha", onLog);
    await mod.startExpo("beta", "/tmp/beta", onLog);

    expect(broadcast).not.toHaveBeenCalledWith(stoppedFor("alpha"));
    expect(mod.isRunning("alpha")).toBe(true);
    expect(mod.isRunning("beta")).toBe(true);
  });

  it("evicts the least-recently-used preview when a new start exceeds the budget", async () => {
    process.env.MAX_LIVE_PREVIEWS = "2";
    const mod = await import("./process-manager.js");
    const onLog = vi.fn();

    await mod.startExpo("alpha", "/tmp/alpha", onLog); // oldest → the LRU victim
    await mod.startExpo("beta", "/tmp/beta", onLog);
    broadcast.mockClear();
    await mod.startExpo("gamma", "/tmp/gamma", onLog); // 3rd start, budget is 2

    expect(broadcast).toHaveBeenCalledWith(stoppedFor("alpha"));
    expect(mod.isRunning("alpha")).toBe(false);
    expect(mod.isRunning("beta")).toBe(true);
    expect(mod.isRunning("gamma")).toBe(true);
  });

  it("touchPreview protects the actively-viewed preview from LRU eviction", async () => {
    process.env.MAX_LIVE_PREVIEWS = "2";
    const mod = await import("./process-manager.js");
    const onLog = vi.fn();

    await mod.startExpo("alpha", "/tmp/alpha", onLog);
    await mod.startExpo("beta", "/tmp/beta", onLog);
    mod.touchPreview("alpha"); // alpha is now most-recently-used → beta becomes the LRU
    broadcast.mockClear();
    await mod.startExpo("gamma", "/tmp/gamma", onLog);

    expect(mod.isRunning("alpha")).toBe(true);
    expect(mod.isRunning("beta")).toBe(false);
    expect(mod.isRunning("gamma")).toBe(true);
  });

  it("restarting the same project does not evict other live previews", async () => {
    process.env.MAX_LIVE_PREVIEWS = "2";
    const mod = await import("./process-manager.js");
    const onLog = vi.fn();

    await mod.startExpo("alpha", "/tmp/alpha", onLog);
    await mod.startExpo("beta", "/tmp/beta", onLog);
    broadcast.mockClear();
    await mod.startExpo("beta", "/tmp/beta", onLog); // own restart — not a new slot

    expect(broadcast).not.toHaveBeenCalledWith(stoppedFor("alpha"));
    expect(mod.isRunning("alpha")).toBe(true);
    expect(mod.isRunning("beta")).toBe(true);
  });

  it("broadcasts preview stopped when killExpo is called", async () => {
    process.env.MAX_LIVE_PREVIEWS = "3";
    const mod = await import("./process-manager.js");
    const onLog = vi.fn();

    await mod.startExpo("alpha", "/tmp/alpha", onLog);
    broadcast.mockClear();
    mod.killExpo("alpha");

    expect(broadcast).toHaveBeenCalledWith(stoppedFor("alpha"));
  });
});
