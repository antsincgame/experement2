// Verifies that heavy project operations are serialized per queue key and isolated across projects.
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  enqueueProjectOperation,
  getProjectOperationQueueKey,
} from "./project-operation-lock.js";

describe("project-operation-lock", () => {
  it("serializes operations that share the same key", async () => {
    const events: string[] = [];
    let releaseFirst: () => void = () => undefined;

    const first = enqueueProjectOperation(
      getProjectOperationQueueKey("alpha"),
      "first",
      async () => {
        events.push("first:start");
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
        events.push("first:end");
      }
    );

    const second = enqueueProjectOperation(
      getProjectOperationQueueKey("alpha"),
      "second",
      async () => {
        events.push("second:start");
        events.push("second:end");
      }
    );

    await Promise.resolve();
    await Promise.resolve();
    expect(events).toEqual(["first:start"]);

    releaseFirst();
    await Promise.all([first, second]);

    expect(events).toEqual([
      "first:start",
      "first:end",
      "second:start",
      "second:end",
    ]);
  });

  it("allows different project keys to proceed independently", async () => {
    let releaseFirst: () => void = () => undefined;
    let secondStarted = false;

    const first = enqueueProjectOperation(
      getProjectOperationQueueKey("alpha"),
      "first",
      async () => {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
      }
    );

    const second = enqueueProjectOperation(
      getProjectOperationQueueKey("beta"),
      "second",
      async () => {
        secondStarted = true;
      }
    );

    await Promise.resolve();
    await Promise.resolve();
    expect(secondStarted).toBe(true);

    releaseFirst();
    await Promise.all([first, second]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("honors per-operation timeoutMs override", async () => {
    vi.useFakeTimers();
    let rejected: Error | null = null;

    const pending = enqueueProjectOperation(
      getProjectOperationQueueKey("timeout-test"),
      "slow",
      () => new Promise<string>(() => undefined),
      { timeoutMs: 5_000 },
    ).catch((error: unknown) => {
      rejected = error instanceof Error ? error : new Error(String(error));
    });

    await vi.advanceTimersByTimeAsync(5_000);
    await pending;

    expect(rejected?.message).toBe("Operation slow timed out after 5s");
  });
});

