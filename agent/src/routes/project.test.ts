// Verifies project file routes persist edits safely and reject path traversal.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  projectExists: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("../services/file-manager.js", () => ({
  projectExists: mocks.projectExists,
  writeFile: mocks.writeFile,
  getFileTree: vi.fn(),
  readFile: vi.fn(),
  listAllFiles: vi.fn(),
  getWorkspaceRoot: vi.fn(),
}));

const getRouteHandler = async (method: "get" | "put" | "delete", routePath: string) => {
  const { projectRouter } = await import("./project.js");
  const layer = projectRouter.stack.find(
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
});

describe("projectRouter PUT /:name/file", () => {
  it("writes file content for a valid project path", async () => {
    const handler = await getRouteHandler("put", "/:name/file");
    const res = createResponse();

    handler(
      {
        params: { name: "demo-app" },
        body: { path: "app/index.tsx", content: "export default function App() {}" },
      },
      res
    );

    expect(mocks.writeFile).toHaveBeenCalledWith(
      "demo-app",
      "app/index.tsx",
      "export default function App() {}"
    );
    expect(res.json).toHaveBeenCalledWith({ data: { path: "app/index.tsx" } });
  });

  it("rejects traversal paths before writing", async () => {
    const handler = await getRouteHandler("put", "/:name/file");
    const res = createResponse();

    handler(
      {
        params: { name: "demo-app" },
        body: { path: "../secrets.txt", content: "hack" },
      },
      res
    );

    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 404 when project does not exist", async () => {
    mocks.projectExists.mockReturnValue(false);
    const handler = await getRouteHandler("put", "/:name/file");
    const res = createResponse();

    handler(
      {
        params: { name: "missing" },
        body: { path: "app.tsx", content: "x" },
      },
      res
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });
});
