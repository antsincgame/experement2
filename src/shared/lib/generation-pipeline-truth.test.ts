import { describe, expect, it } from "vitest";
import {
  getGenerationActivityHeader,
  isPipelineFullyShipped,
  resolveTimelineRank,
} from "./generation-pipeline-truth";

describe("generation-pipeline-truth", () => {
  it("treats ready without shipped checkpoint as incomplete", () => {
    expect(isPipelineFullyShipped(null)).toBe(false);
    expect(isPipelineFullyShipped("codegen")).toBe(false);
    expect(getGenerationActivityHeader("ready", null)).toContain("not recorded");
  });

  it("marks all phases done only when shipped", () => {
    expect(resolveTimelineRank("ready", "shipped")).toBe(6);
    expect(resolveTimelineRank("ready", "codegen")).toBeLessThan(6);
  });
});
