import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("http-proxy-middleware", () => ({
    createProxyMiddleware: vi.fn((options) => {
        const handler = (() => undefined);
        handler.__proxyOptions = options;
        return handler;
    }),
}));
let createPreviewProxy;
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
        expect(createProxyMiddleware).toHaveBeenCalledWith(expect.objectContaining({
            target: "http://127.0.0.1:8080",
        }));
    });
    it("enables websocket support", async () => {
        const { createProxyMiddleware } = await import("http-proxy-middleware");
        createPreviewProxy(3000);
        expect(createProxyMiddleware).toHaveBeenCalledWith(expect.objectContaining({
            ws: true,
        }));
    });
    it("rewrites /preview prefix to empty string", async () => {
        const { createProxyMiddleware } = await import("http-proxy-middleware");
        createPreviewProxy(3000);
        expect(createProxyMiddleware).toHaveBeenCalledWith(expect.objectContaining({
            pathRewrite: { "^/preview": "" },
        }));
    });
    it("strips security headers in proxyRes handler", async () => {
        const { createProxyMiddleware } = await import("http-proxy-middleware");
        createPreviewProxy(3000);
        const callArgs = vi.mocked(createProxyMiddleware).mock.calls[0][0];
        const onHandlers = callArgs.on;
        expect(onHandlers).toBeDefined();
        expect(typeof onHandlers.proxyRes).toBe("function");
        const fakeHeaders = {
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
        const callArgs = vi.mocked(createProxyMiddleware).mock.calls[0][0];
        const onHandlers = callArgs.on;
        const fakeHeaders = {};
        const fakeProxyRes = { headers: fakeHeaders };
        onHandlers.proxyRes(fakeProxyRes);
        expect(fakeHeaders["access-control-allow-origin"]).toBe("*");
        expect(fakeHeaders["access-control-allow-methods"]).toBe("GET, POST, OPTIONS");
        expect(fakeHeaders["access-control-allow-headers"]).toBe("Content-Type");
    });
    it("error handler responds with 502", async () => {
        const { createProxyMiddleware } = await import("http-proxy-middleware");
        createPreviewProxy(3000);
        const callArgs = vi.mocked(createProxyMiddleware).mock.calls[0][0];
        const onHandlers = callArgs.on;
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
        expect(fakeRes.end).toHaveBeenCalledWith("Preview not available. Metro may still be starting...");
    });
});
//# sourceMappingURL=preview-proxy.test.js.map