import { describe, expect, it } from "vitest";
import {
  hasStreamingGenerationFiles,
  isGenerationActive,
  isPipelineBusy,
} from "./generation-status";

describe("generation-status guards", () => {
  it("isPipelineBusy when status is active", () => {
    expect(isPipelineBusy("generating", [])).toBe(true);
  });

  it("isPipelineBusy when a file is still streaming after status went ready", () => {
    expect(
      isPipelineBusy("ready", [{ path: "src/x.tsx", status: "streaming" }]),
    ).toBe(true);
  });

  it("is not busy when idle with all files done", () => {
    expect(
      isPipelineBusy("ready", [{ path: "src/x.tsx", status: "done" }]),
    ).toBe(false);
  });

  it("isGenerationActive excludes ready and error", () => {
    expect(isGenerationActive("ready")).toBe(false);
    expect(isGenerationActive("error")).toBe(false);
    expect(isGenerationActive("generating")).toBe(true);
  });

  it("hasStreamingGenerationFiles detects in-flight files", () => {
    expect(hasStreamingGenerationFiles([{ path: "a", status: "done" }])).toBe(false);
    expect(hasStreamingGenerationFiles([{ path: "a", status: "streaming" }])).toBe(true);
  });
});
