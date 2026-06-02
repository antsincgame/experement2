import { describe, it, expect } from "vitest";
import { collectStream } from "./stream-collect.js";

const gen = (chunks: string[]): AsyncGenerator<string> =>
  (async function* () {
    for (const c of chunks) yield c;
  })();

describe("collectStream", () => {
  it("concatenates all chunks in order", async () => {
    expect(await collectStream(gen(["a", "b", "c"]))).toBe("abc");
  });

  it("returns an empty string for an empty stream", async () => {
    expect(await collectStream(gen([]))).toBe("");
  });
});
