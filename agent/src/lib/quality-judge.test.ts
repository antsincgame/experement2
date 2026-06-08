import { describe, expect, it } from "vitest";
import { judgeProject } from "./quality-judge.js";
import type { CompleteFn } from "../services/llm-proxy.js";

const fakeComplete = (output: string): CompleteFn =>
  (async () => {
    async function* gen(): AsyncGenerator<string> {
      yield output;
    }
    return gen();
  }) as unknown as CompleteFn;

const input = {
  plan: { displayName: "Notes", description: "A notes app" },
  files: [{ path: "app/(tabs)/index.tsx", content: "export default function Home(){return null}\n// EOF" }],
};

describe("judgeProject", () => {
  it("parses a valid JSON judgement and computes the mean overall", async () => {
    const out = await judgeProject({
      ...input,
      complete: fakeComplete(
        '{"correctness":90,"idiomatic":80,"completeness":70,"visual":60,"planAdherence":100,"rationale":"solid"}',
      ),
    });
    expect(out).not.toBeNull();
    expect(out!.axes.correctness).toBe(90);
    expect(out!.overall).toBe(80); // mean of 90,80,70,60,100
    expect(out!.rationale).toBe("solid");
  });

  it("clamps out-of-range axis values", async () => {
    const out = await judgeProject({
      ...input,
      complete: fakeComplete(
        '{"correctness":150,"idiomatic":-10,"completeness":50,"visual":50,"planAdherence":50}',
      ),
    });
    expect(out!.axes.correctness).toBe(100);
    expect(out!.axes.idiomatic).toBe(0);
  });

  it("returns null on malformed JSON (caller falls back to deterministic)", async () => {
    const out = await judgeProject({ ...input, complete: fakeComplete("not json at all, sorry") });
    expect(out).toBeNull();
  });

  it("returns null on an all-zero parse", async () => {
    const out = await judgeProject({
      ...input,
      complete: fakeComplete('{"correctness":0,"idiomatic":0,"completeness":0,"visual":0,"planAdherence":0}'),
    });
    expect(out).toBeNull();
  });

  it("returns null (never throws) when complete throws", async () => {
    const throwing = (async () => {
      throw new Error("LLM down");
    }) as unknown as CompleteFn;
    await expect(judgeProject({ ...input, complete: throwing })).resolves.toBeNull();
  });
});
