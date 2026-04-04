// Keeps preview proxy tests aligned with the safe ws:false behavior that avoids hijacking the agent socket.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RequestHandler } from "http-proxy-middleware";

vi.mock("http-proxy-middleware", () => ({
  createProxyMiddleware: vi.fn((options: Record<string, unknown>) => {
    const handler = (() => undefined) as unknown as RequestHandler;
    ((handler as unknown) as Record<string, unknown>).__proxyOptions = options;
    return handler;
  }),
}));

let createPreviewProxy: typeof import("./preview-proxy.js").createPreviewProxy;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import("./preview-proxy.js");
  createPreviewProxy = mod.createPreviewProxy;
});

describe("preview-proxy", () => {
  it("returns a function (middleware)", () => {
    const proxy = createPreviewProxy(3000);
    expect(typeof proxy).toBe("function");
  });

  it("targets the correct port", async () => {
    const { createProxyMiddleware } = await import("http-proxy-middleware");
    createPreviewProxy(8080);

    expect(createProxyMiddleware).toHaveBeenCalledWith(
      expect.objectContaining({
        target: "http://127.0.0.1:8080",
      })
    );
  });

  it("keeps websocket proxying disabled to protect the agent socket", async () => {
    const { createProxyMiddleware } = await import("http-proxy-middleware");
    createPreviewProxy(3000);

    expect(createProxyMiddleware).toHaveBeenCalledWith(
      expect.objectContaining({
        ws: false,
      })
    );
  });

  it("accepts optional projectName parameter", () => {
    const proxy = createPreviewProxy(3000, "test-app");
    expect(typeof proxy).toBe("function");
  });

  it("strips security headers in proxyRes handler", async () => {
    const { createProxyMiddleware } = await import("http-proxy-middleware");
    createPreviewProxy(3000);

    const callArgs = vi.mocked(createProxyMiddleware).mock.calls[0][0] as Record<string, unknown>;
    const onHandlers = callArgs.on as Record<string, (...args: unknown[]) => void>;
    expect(onHandlers).toBeDefined();
    expect(typeof onHandlers.proxyRes).toBe("function");

    const fakeHeaders: Record<string, string | undefined> = {
      "x-frame-options": "DENY",
      "content-security-policy": "default-src 'self'",
      "x-content-type-options": "nosniff",
    };
    const fakeProxyRes = { headers: fakeHeaders };

    onHandlers.proxyRes(fakeProxyRes);

    expect(fakeHeaders["x-frame-options"]).toBeUndefined();
    expect(fakeHeaders["content-security-policy"]).toBeUndefined();
    expect(fakeHeaders["x-content-type-options"]).toBeUndefined();
  });

  it("adds CORS headers in proxyRes handler", async () => {
    const { createProxyMiddleware } = await import("http-proxy-middleware");
    createPreviewProxy(5000);

    const callArgs = vi.mocked(createProxyMiddleware).mock.calls[0][0] as Record<string, unknown>;
    const onHandlers = callArgs.on as Record<string, (...args: unknown[]) => void>;
    const fakeHeaders: Record<string, string | undefined> = {};
    const fakeProxyRes = { headers: fakeHeaders };

    onHandlers.proxyRes(fakeProxyRes);

    expect(fakeHeaders["access-control-allow-origin"]).toBe("*");
    expect(fakeHeaders["access-control-allow-methods"]).toBe(
      "GET, POST, OPTIONS"
    );
    expect(fakeHeaders["access-control-allow-headers"]).toBe("Content-Type");
  });

  it("error handler responds with 502", async () => {
    const { createProxyMiddleware } = await import("http-proxy-middleware");
    createPreviewProxy(3000);

    const callArgs = vi.mocked(createProxyMiddleware).mock.calls[0][0] as Record<string, unknown>;
    const onHandlers = callArgs.on as Record<string, (...args: unknown[]) => void>;
    expect(typeof onHandlers.error).toBe("function");

    const fakeRes = {
      writeHead: vi.fn(),
      end: vi.fn(),
    };
    const fakeErr = new Error("connection refused");

    onHandlers.error(fakeErr, {}, fakeRes);

    expect(fakeRes.writeHead).toHaveBeenCalledWith(502, {
      "Content-Type": "text/plain",
    });
    expect(fakeRes.end).toHaveBeenCalledWith(
      expect.stringContaining("Preview not available")
    );
  });
});
