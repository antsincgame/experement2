import { describe, expect, it } from "vitest";
import {
  prunePreviewFrames,
  resolvePreviewDisplay,
  upsertPreviewFrame,
  type PreviewFrame,
} from "./preview-frame-pool";

const frame = (projectName: string, src = `${projectName}-src`): PreviewFrame => ({
  projectName,
  src,
});

describe("upsertPreviewFrame", () => {
  it("adds the first frame as the head", () => {
    const next = upsertPreviewFrame([], "alpha", "alpha-src", 3);
    expect(next).toEqual([frame("alpha")]);
  });

  it("promotes an existing project to most-recently-used (head) without duplicating it", () => {
    const start = [frame("alpha"), frame("beta"), frame("gamma")];
    const next = upsertPreviewFrame(start, "gamma", "gamma-src", 3);
    expect(next.map((f) => f.projectName)).toEqual(["gamma", "alpha", "beta"]);
    expect(next.filter((f) => f.projectName === "gamma")).toHaveLength(1);
  });

  it("updates the src of the active project when it reloads to a fresh preview", () => {
    const start = [frame("alpha", "old"), frame("beta")];
    const next = upsertPreviewFrame(start, "alpha", "new", 3);
    expect(next[0]).toEqual({ projectName: "alpha", src: "new" });
    expect(next.map((f) => f.projectName)).toEqual(["alpha", "beta"]);
  });

  it("evicts the least-recently-used frame when the cap is exceeded", () => {
    const start = [frame("gamma"), frame("beta"), frame("alpha")]; // alpha is LRU
    const next = upsertPreviewFrame(start, "delta", "delta-src", 3);
    expect(next.map((f) => f.projectName)).toEqual(["delta", "gamma", "beta"]);
    expect(next.some((f) => f.projectName === "alpha")).toBe(false);
  });

  it("returns the same reference when the active project is already the head with the same src", () => {
    const start = [frame("alpha"), frame("beta")];
    const next = upsertPreviewFrame(start, "alpha", "alpha-src", 3);
    expect(next).toBe(start);
  });

  it("treats a cap below 1 as 1 so the pool never empties", () => {
    const next = upsertPreviewFrame([frame("alpha")], "beta", "beta-src", 0);
    expect(next).toEqual([frame("beta")]);
  });
});

describe("prunePreviewFrames", () => {
  it("drops frames whose project is gone", () => {
    const start = [frame("alpha"), frame("beta"), frame("gamma")];
    const next = prunePreviewFrames(start, ["alpha", "gamma"]);
    expect(next.map((f) => f.projectName)).toEqual(["alpha", "gamma"]);
  });

  it("returns the same reference when nothing is pruned", () => {
    const start = [frame("alpha"), frame("beta")];
    const next = prunePreviewFrames(start, ["alpha", "beta", "gamma"]);
    expect(next).toBe(start);
  });
});

describe("resolvePreviewDisplay", () => {
  it("shows the placeholder when there is no cached frame for the active project", () => {
    expect(
      resolvePreviewDisplay({ hasActiveFrame: false, isError: false, isReady: false }),
    ).toEqual({ showPlaceholder: true, isWaking: false });
  });

  it("shows the frozen frame with a waking hint while a cached preview respawns", () => {
    // The seamless-wake case: a cached frame exists, preview not yet ready, no error.
    expect(
      resolvePreviewDisplay({ hasActiveFrame: true, isError: false, isReady: false }),
    ).toEqual({ showPlaceholder: false, isWaking: true });
  });

  it("shows the live frame with no waking hint once ready", () => {
    expect(
      resolvePreviewDisplay({ hasActiveFrame: true, isError: false, isReady: true }),
    ).toEqual({ showPlaceholder: false, isWaking: false });
  });

  it("covers a stale cached frame with the placeholder when the preview errors", () => {
    expect(
      resolvePreviewDisplay({ hasActiveFrame: true, isError: true, isReady: false }),
    ).toEqual({ showPlaceholder: true, isWaking: false });
  });
});
