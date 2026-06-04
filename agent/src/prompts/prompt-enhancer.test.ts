// Ensures prompt enhancer system text matches the scaffold stack (Tamagui 1.x, not "v2").
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const llmRouteSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../routes/llm.ts"),
  "utf8",
);

describe("prompt enhancer (/api/llm/enhance)", () => {
  it("does not instruct the model to output Tamagui v2", () => {
    expect(llmRouteSource).not.toMatch(/STRICTLY Tamagui v2/i);
    expect(llmRouteSource).toContain("Tamagui 1.x");
    expect(llmRouteSource).toContain('NEVER say "Tamagui v2"');
  });
});
