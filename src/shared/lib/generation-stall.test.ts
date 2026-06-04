import { describe, expect, it } from "vitest";
import { getStalledStreamingPaths, hasStalledGenerationUi } from "./generation-stall";

describe("generation-stall", () => {
  it("lists streaming paths as stalled when status is idle", () => {
    expect(
      getStalledStreamingPaths([
        { path: "a.tsx", status: "done" },
        { path: "b.tsx", status: "streaming" },
      ]),
    ).toEqual(["b.tsx"]);
    expect(hasStalledGenerationUi("ready", [{ path: "b.tsx", status: "streaming" }])).toBe(true);
    expect(hasStalledGenerationUi("generating", [{ path: "b.tsx", status: "streaming" }])).toBe(
      false,
    );
  });
});
