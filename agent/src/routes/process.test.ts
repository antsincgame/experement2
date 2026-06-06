// Verifies process routes keep project-scoped preview URLs and require confirmation for dangerous actions.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActivePort: vi.fn(),
  isRunning: vi.fn(),
  killExpo: vi.fn(),
  projectExists: vi.fn(),
  resolveTrackedPreviewPort: vi.fn(),
  killOrphanedListenerOnPort: vi.fn(),
  setPreviewPort: vi.fn(),
}));

vi.mock("../services/process-manager.js", () => ({
  getActivePort: mocks.getActivePort,
  isRunning: mocks.isRunning,
  killExpo: mocks.killExpo,
}));

vi.mock("../services/file-manager.js", () => ({
  projectExists: mocks.projectExists,
}));

vi.mock("../lib/preview-restart.js", () => ({
  resolveTrackedPreviewPort: mocks.resolveTrackedPreviewPort,
  killOrphanedListenerOnPort: mocks.killOrphanedListenerOnPort,
}));

vi.mock("../lib/event-bus.js", () => ({
  getPreviewPort: vi.fn(),
  setPreviewPort: mocks.setPreviewPort,
}));

const getRouteHandler = async (method: "get" | "post", routePath: string) => {
  const { processRouter } = await import("./process.js");
  const layer = processRouter.stack.find(
    (entry) => entry.route?.path === routePath && entry.route.methods[method]
  );

  if (!layer) {
    throw new Error(`Route not found: ${method.toUpperCase()} ${routePath}`);
  }

  return layer.route.stack[0]?.handle;
};

const createResponse = () => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  };

  return res;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.projectExists.mockReturnValue(true);
  mocks.isRunning.mockReturnValue(true);
  mocks.getActivePort.mockReturnValue(8081);
  mocks.resolveTrackedPreviewPort.mockReturnValue(8081);
});

describe("processRouter", () => {
  it("returns a project-scoped preview URL", async () => {
    const handler = await getRouteHandler("get", "/:name/status");
    const res = createResponse();

    handler({ params: { name: "demo-app" } }, res);

    expect(res.json).toHaveBeenCalledWith({
      data: {
        running: true,
        port: 8081,
        previewUrl: "/preview/demo-app/",
      },
    });
  });

  it("rejects kill requests without explicit confirmation", async () => {
    const handler = await getRouteHandler("post", "/:name/kill");
    const res = createResponse();

    handler({ headers: {}, params: { name: "demo-app" } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: "Preview process kill requires explicit confirmation",
      code: "CONFIRMATION_REQUIRED",
    });
    expect(mocks.killExpo).not.toHaveBeenCalled();
  });

  it("kills the tracked Metro process and clears the preview port registry", async () => {
    const handler = await getRouteHandler("post", "/:name/kill");
    const res = createResponse();

    handler(
      {
        headers: { "x-app-factory-confirm": "kill-preview-process" },
        params: { name: "demo-app" },
      },
      res
    );

    expect(mocks.killExpo).toHaveBeenCalledWith("demo-app");
    expect(mocks.killOrphanedListenerOnPort).toHaveBeenCalledWith(8081);
    expect(mocks.setPreviewPort).toHaveBeenCalledWith("demo-app", null);
    expect(res.json).toHaveBeenCalledWith({
      data: { message: "Process killed", port: 8081 },
    });
  });
});
