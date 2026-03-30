import { createProxyMiddleware, type RequestHandler } from "http-proxy-middleware";

export const createPreviewProxy = (targetPort: number): RequestHandler =>
  createProxyMiddleware({
    target: `http://127.0.0.1:${targetPort}`,
    changeOrigin: true,
    ws: true,
    pathRewrite: { "^/preview": "" },
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
        console.error("[PreviewProxy] Error:", err.message);
        if ("writeHead" in res && typeof res.writeHead === "function") {
          (res as import("http").ServerResponse).writeHead(502, {
            "Content-Type": "text/plain",
          });
          (res as import("http").ServerResponse).end(
            "Preview not available. Metro may still be starting..."
          );
        }
      },
    },
  });
