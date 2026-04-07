// Locks scoped event delivery so explicit scope metadata and client targeting do not regress.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  broadcast,
  handlePreviewRequest,
  registerClient,
  runWithEventScope,
  unregisterClient,
} from "./event-bus.js";

const createMockSocket = () => ({
  readyState: 1,
  send: vi.fn(),
});

afterEach(() => {
  unregisterClient("client-a");
  unregisterClient("client-b");
});

describe("event-bus", () => {
  it("broadcasts global events to every connected client", () => {
    const clientA = createMockSocket();
    const clientB = createMockSocket();

    registerClient("client-a", clientA as never);
    registerClient("client-b", clientB as never);

    broadcast({ type: "llm_server_status", status: "connected" });

    expect(clientA.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "llm_server_status", status: "connected" })
    );
    expect(clientB.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "llm_server_status", status: "connected" })
    );
  });

  it("routes scoped events only to the active client and injects scope metadata", () => {
    const clientA = createMockSocket();
    const clientB = createMockSocket();

    registerClient("client-a", clientA as never);
    registerClient("client-b", clientB as never);

    runWithEventScope(
      {
        clientId: "client-a",
        projectName: "demo-app",
        requestId: "1f4f0f3b-8d07-47c8-8681-5a5a9afcb1f1",
      },
      () => {
        broadcast({ type: "status", status: "ready" });
      }
    );

    expect(clientA.send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(clientA.send.mock.calls[0]?.[0] ?? "{}")).toEqual({
      type: "status",
      status: "ready",
      projectName: "demo-app",
      requestId: "1f4f0f3b-8d07-47c8-8681-5a5a9afcb1f1",
    });
    expect(clientB.send).not.toHaveBeenCalled();
  });

  it("uses explicit scope for async-style deliveries without relying on AsyncLocalStorage", () => {
    const clientA = createMockSocket();
    const clientB = createMockSocket();

    registerClient("client-a", clientA as never);
    registerClient("client-b", clientB as never);

    broadcast(
      {
        type: "preview_status",
        previewStatus: "starting",
        buildId: "11111111-1111-4111-8111-111111111111",
      },
      {
        clientId: "client-b",
        projectName: "demo-app",
        requestId: "1f4f0f3b-8d07-47c8-8681-5a5a9afcb1f1",
      }
    );

    expect(clientA.send).not.toHaveBeenCalled();
    expect(JSON.parse(clientB.send.mock.calls[0]?.[0] ?? "{}")).toEqual({
      type: "preview_status",
      previewStatus: "starting",
      buildId: "11111111-1111-4111-8111-111111111111",
      projectName: "demo-app",
      requestId: "1f4f0f3b-8d07-47c8-8681-5a5a9afcb1f1",
    });
  });

  it("rejects preview requests without a project name", () => {
    const req = { path: "/", url: "/" } as never;
    const res = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
    } as never;
    const next = vi.fn();

    handlePreviewRequest(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith(
      "Preview requests must include a project name."
    );
    expect(next).not.toHaveBeenCalled();
  });
});
