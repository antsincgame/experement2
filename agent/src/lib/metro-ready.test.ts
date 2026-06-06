// Verifies the Metro health check treats any HTTP response as "alive" (a 404 from
// an app without a root route must not look like a dead bundler) and that the
// lazy-build trigger lands a request to start compilation.
import { describe, expect, it, vi } from "vitest";
import { refreshPreviewBundle, triggerMetroBuild, waitForMetroReady } from "./metro-ready.js";

const response = (init: { ok: boolean; status: number; html?: string }): Response =>
  ({
    ok: init.ok,
    status: init.status,
    text: async () => init.html ?? "",
  }) as unknown as Response;

const timeoutError = (): Error => {
  const error = new Error("aborted");
  error.name = "TimeoutError";
  return error;
};

describe("waitForMetroReady", () => {
  it("treats a 404 as a live Metro (app without a root route)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(response({ ok: false, status: 404 }));

    const ready = await waitForMetroReady(7777, 3, fetchFn as unknown as typeof fetch);

    expect(ready).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("warms the bundle on a 2xx index and reports ready", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        response({ ok: true, status: 200, html: '<script src="/index.bundle"></script>' })
      )
      .mockResolvedValueOnce(response({ ok: true, status: 200 }));

    const ready = await waitForMetroReady(7777, 3, fetchFn as unknown as typeof fetch);

    expect(ready).toBe(true);
    // Root probe + warm bundle fetch.
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[1][0]).toContain("/index.bundle");
  });

  it("returns false when the server never accepts connections", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const ready = await waitForMetroReady(7777, 2, fetchFn as unknown as typeof fetch);

    expect(ready).toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

describe("refreshPreviewBundle", () => {
  it("triggers a build request then waits for Metro to serve", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(response({ ok: true, status: 200, text: async () => '<script src="/index.bundle"></script>' }));

    const ready = await refreshPreviewBundle(7777, fetchFn as unknown as typeof fetch);

    expect(ready).toBe(true);
    expect(fetchFn.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe("triggerMetroBuild", () => {
  it("returns as soon as a request lands", async () => {
    const fetchFn = vi.fn().mockResolvedValue(response({ ok: false, status: 404 }));

    await triggerMetroBuild(7777, 5, fetchFn as unknown as typeof fetch);

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("stops on a compile timeout — the request still triggered the build", async () => {
    const fetchFn = vi.fn().mockRejectedValue(timeoutError());

    await triggerMetroBuild(7777, 5, fetchFn as unknown as typeof fetch);

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("retries while the server is still booting, then lands", async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValueOnce(response({ ok: true, status: 200 }));

    await triggerMetroBuild(7777, 5, fetchFn as unknown as typeof fetch);

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
