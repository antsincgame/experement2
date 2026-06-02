// Integration-test harness for the LLM boundary.
//
// streamCompletion is the single seam every planner/generator/editor/auto-fixer
// call goes through, so mocking just this lets integration tests drive the REAL
// orchestration (file I/O, ts-morph, validators, repair loops) against scripted
// model output — no network, no LM Studio, fully deterministic.
export type ChatMsg = { role: string; content: string };

/** Wrap a full model response as the single-chunk async stream streamCompletion yields. */
export const streamOf = (text: string): AsyncGenerator<string> =>
  (async function* () {
    yield text;
  })();

/**
 * Build a streamCompletion implementation that selects its response by inspecting
 * the outgoing user message, and records every call's user content so tests can
 * assert call count and ordering.
 *
 * Usage with vitest:
 *   const mocks = vi.hoisted(() => ({ streamCompletion: vi.fn() }));
 *   vi.mock("../services/llm-proxy.js", () => ({ streamCompletion: mocks.streamCompletion }));
 *   const script = scriptedStream((user) => pickResponse(user));
 *   mocks.streamCompletion.mockImplementation(script.impl);
 */
export const scriptedStream = (
  pick: (userContent: string) => string | undefined,
  fallback = ""
): {
  impl: (messages: ChatMsg[]) => Promise<AsyncGenerator<string>>;
  calls: string[];
} => {
  const calls: string[] = [];
  const impl = async (messages: ChatMsg[]): Promise<AsyncGenerator<string>> => {
    const userContent = messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join("\n");
    calls.push(userContent);
    return streamOf(pick(userContent) ?? fallback);
  };
  return { impl, calls };
};
