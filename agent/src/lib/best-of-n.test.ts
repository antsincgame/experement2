import { describe, expect, it } from "vitest";
import { generateBestCandidate, spreadTemperatures } from "./best-of-n.js";
import type { CompleteFn } from "../services/llm-proxy.js";

// A fake `complete` that returns a queued output per call (one per candidate sample).
const queuedComplete = (outputs: string[]): CompleteFn => {
  let i = 0;
  return (async () => {
    const out = outputs[i++] ?? "";
    async function* g(): AsyncGenerator<string> {
      yield out;
    }
    return g();
  }) as unknown as CompleteFn;
};

const idExtract = (t: string) => (t.length > 0 ? t : null);

describe("spreadTemperatures", () => {
  it("returns the base for n<=1 and a spread for n>1", () => {
    expect(spreadTemperatures(0.4, 1)).toEqual([0.4]);
    const s = spreadTemperatures(0.4, 3);
    expect(s).toHaveLength(3);
    expect(s[0]).toBeLessThan(s[2]); // ascending spread
  });
});

describe("generateBestCandidate", () => {
  it("picks the highest-scoring candidate", async () => {
    const { winnerText, scores } = await generateBestCandidate({
      n: 3,
      messages: [{ role: "user", content: "x" }] as never,
      options: { temperature: 0.4 } as never,
      complete: queuedComplete(["BAD", "GOOD", "MEH"]),
      extract: idExtract,
      scoreCandidate: (c) => (c === "GOOD" ? 100 : c === "MEH" ? 40 : 0),
    });
    expect(winnerText).toBe("GOOD");
    expect(scores).toEqual([0, 100, 40]);
  });

  it("N=1 returns the single response unchanged", async () => {
    const { winnerText } = await generateBestCandidate({
      n: 1,
      messages: [{ role: "user", content: "x" }] as never,
      options: { temperature: 0.4 } as never,
      complete: queuedComplete(["only-one"]),
      extract: idExtract,
      scoreCandidate: () => 50,
    });
    expect(winnerText).toBe("only-one");
  });

  it("falls back to the first response when no candidate yields extractable code", async () => {
    const { winnerText } = await generateBestCandidate({
      n: 2,
      messages: [{ role: "user", content: "x" }] as never,
      options: { temperature: 0.4 } as never,
      complete: queuedComplete(["", ""]),
      extract: () => null,
      scoreCandidate: () => 0,
    });
    // both unusable → pool is all candidates → first is returned (never worse than 1 sample)
    expect(winnerText).toBe("");
  });

  it("treats a throwing sample as unusable and still returns a usable winner", async () => {
    let call = 0;
    const flaky = (async () => {
      call++;
      if (call === 1) throw new Error("stalled");
      async function* g(): AsyncGenerator<string> {
        yield "GOOD";
      }
      return g();
    }) as unknown as CompleteFn;

    const { winnerText } = await generateBestCandidate({
      n: 2,
      messages: [{ role: "user", content: "x" }] as never,
      options: { temperature: 0.4 } as never,
      complete: flaky,
      extract: idExtract,
      scoreCandidate: () => 90,
    });
    expect(winnerText).toBe("GOOD");
  });
});
