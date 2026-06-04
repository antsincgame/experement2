import { describe, expect, it } from "vitest";
import { formatBuildEventLine } from "./format-build-event";

describe("formatBuildEventLine", () => {
  it("passes through moe_swap labels", () => {
    expect(formatBuildEventLine("moe_swap", "Planner: foo")).toBe("Planner: foo");
  });

  it("formats build errors with truncation headroom", () => {
    const long = "x".repeat(400);
    expect(formatBuildEventLine("build_error", undefined, long).length).toBeLessThanOrEqual(300);
  });
});
