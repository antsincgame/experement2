// Transition matrix for centralized generation phase machine.
import { describe, expect, it } from "vitest";
import {
  resolveGenerationPhase,
  shouldAdvanceGenerationStatus,
  type GenerationPhaseSignal,
} from "./generation-phase-machine";

describe("resolveGenerationPhase", () => {
  it("agent_status follows monotonic rank", () => {
    expect(
      resolveGenerationPhase("scaffolding", { kind: "agent_status", status: "generating" }),
    ).toBe("generating");
    expect(
      resolveGenerationPhase("building", { kind: "agent_status", status: "scaffolding" }),
    ).toBeNull();
  });

  it("scaffold_complete unsticks scaffolding", () => {
    expect(resolveGenerationPhase("scaffolding", { kind: "scaffold_complete" })).toBe(
      "generating",
    );
    expect(resolveGenerationPhase("generating", { kind: "scaffold_complete" })).toBe(
      "generating",
    );
  });

  it("build_success advances to building", () => {
    expect(resolveGenerationPhase("scaffolding", { kind: "build_success" })).toBe("building");
    expect(resolveGenerationPhase("generating", { kind: "build_success" })).toBe("building");
    expect(resolveGenerationPhase("building", { kind: "build_success" })).toBe("building");
  });

  it("preview_ready and abort land on ready", () => {
    expect(resolveGenerationPhase("building", { kind: "preview_ready" })).toBe("ready");
    expect(resolveGenerationPhase("generating", { kind: "generation_aborted" })).toBe("ready");
  });

  it("iteration_complete and fatal_error", () => {
    expect(
      resolveGenerationPhase("analyzing", { kind: "iteration_complete", failed: false }),
    ).toBe("ready");
    expect(
      resolveGenerationPhase("ready", { kind: "iteration_complete", failed: true }),
    ).toBe("error");
    expect(resolveGenerationPhase("building", { kind: "fatal_error" })).toBe("error");
  });
});

describe("shouldAdvanceGenerationStatus (re-exported semantics)", () => {
  it("matches legacy generation-status tests", () => {
    expect(shouldAdvanceGenerationStatus("scaffolding", "generating")).toBe(true);
    expect(shouldAdvanceGenerationStatus("building", "scaffolding")).toBe(false);
    expect(shouldAdvanceGenerationStatus("building", "error")).toBe(true);
  });
});
