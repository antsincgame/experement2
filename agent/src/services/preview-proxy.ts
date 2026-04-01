import { createProxyMiddleware, type RequestHandler } from "http-proxy-middleware";

export const createPreviewProxy = (targetPort: number, projectName?: string): RequestHandler =>
  createProxyMiddleware({
    target: `http://127.0.0.1:${targetPort}`,
    changeOrigin: true,
    ws: false, // CRITICAL: ws:true hijacks ALL WebSocket connections including agent WS!
    on: {
      proxyRes(proxyRes) {
        delete proxyRes.headers["x-frame-options"];
        delete proxyRes.headers["content-security-policy"];
        delete proxyRes.headers["x-content-type-options"];

        proxyRes.headers["access-control-allow-origin"] = "*";
        proxyRes.headers["access-control-allow-methods"] = "GET, POST, OPTIONS";
        proxyRes.headers["access-control-allow-headers"] = "Content-Type";
      },
      error(err, _req, res) {
        const label = projectName ? `[PreviewProxy:${projectName}]` : "[PreviewProxy]";
        console.error(`${label} Error:`, err.message);
        if ("writeHead" in res && typeof res.writeHead === "function") {
          (res as import("http").ServerResponse).writeHead(502, {
            "Content-Type": "text/plain",
          });
          (res as import("http").ServerResponse).end(
            `Preview not available for ${projectName ?? "project"}. Metro may still be starting...`
          );
        }
      },
    },
  });
