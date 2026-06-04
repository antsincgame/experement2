import { describe, expect, it } from "vitest";
import { shouldAdvanceGenerationStatus } from "./generation-status";

describe("shouldAdvanceGenerationStatus", () => {
  it("allows forward transitions", () => {
    expect(shouldAdvanceGenerationStatus("scaffolding", "generating")).toBe(true);
    expect(shouldAdvanceGenerationStatus("generating", "building")).toBe(true);
  });

  it("blocks regressive transitions", () => {
    expect(shouldAdvanceGenerationStatus("building", "scaffolding")).toBe(false);
    expect(shouldAdvanceGenerationStatus("generating", "planning")).toBe(false);
  });

  it("always allows error and idle", () => {
    expect(shouldAdvanceGenerationStatus("building", "error")).toBe(true);
    expect(shouldAdvanceGenerationStatus("generating", "idle")).toBe(true);
  });
});
