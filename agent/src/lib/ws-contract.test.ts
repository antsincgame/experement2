// Proves the agent's outbound messages share ONE definition with the frontend: the
// same zod schema the client validates against. The compile-time OutboundMessage type
// is derived from this schema, so these runtime checks guard the refinements TS can't
// express (uuid formats, required payload fields) and prove the cross-package contract
// import resolves at agent runtime.
import { describe, expect, it } from "vitest";
import { IncomingWsMessageSchema } from "../../../src/shared/schemas/ws-messages.js";
import { buildResumeStatusMessage } from "./pipeline-resume-status.js";

// Routing fields the delivery layer injects (event-bus scope + emitBuildScoped); the
// tests add them so each object mirrors the actual wire shape the client receives.
const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const BUILD_ID = "22222222-2222-4222-8222-222222222222";

const accepts = (message: unknown): boolean =>
  IncomingWsMessageSchema.safeParse(message).success;

describe("outbound WS contract (single source of truth with the frontend schema)", () => {
  it("accepts the preview_ready shape the agent emits", () => {
    expect(
      accepts({
        type: "preview_ready",
        projectName: "alpha",
        requestId: REQUEST_ID,
        buildId: BUILD_ID,
        port: 8082,
        proxyUrl: "/preview/alpha/",
      }),
    ).toBe(true);
  });

  it("accepts the preview_status shape the agent emits", () => {
    expect(
      accepts({
        type: "preview_status",
        projectName: "alpha",
        requestId: REQUEST_ID,
        buildId: BUILD_ID,
        previewStatus: "ready",
      }),
    ).toBe(true);
  });

  it("accepts the status shape with an optional previewStatus", () => {
    expect(
      accepts({
        type: "status",
        projectName: "alpha",
        requestId: REQUEST_ID,
        status: "ready",
        previewStatus: "ready",
      }),
    ).toBe(true);
  });

  it("accepts the mutation_duplicate shape with a valid originalType", () => {
    expect(
      accepts({
        type: "mutation_duplicate",
        requestId: REQUEST_ID,
        originalType: "iterate",
      }),
    ).toBe(true);
  });

  it("validates the real buildResumeStatusMessage emission against the contract", () => {
    const message = { ...buildResumeStatusMessage("__contract_probe__"), projectName: "alpha", requestId: REQUEST_ID };
    expect(accepts(message)).toBe(true);
  });

  it("rejects a type that is not part of the contract", () => {
    expect(accepts({ type: "totally_made_up", requestId: REQUEST_ID })).toBe(false);
  });

  it("rejects preview_ready missing its required port payload", () => {
    expect(
      accepts({
        type: "preview_ready",
        projectName: "alpha",
        requestId: REQUEST_ID,
        buildId: BUILD_ID,
        proxyUrl: "/preview/alpha/",
      }),
    ).toBe(false);
  });

  it("rejects mutation_duplicate carrying a non-mutation originalType", () => {
    expect(
      accepts({
        type: "mutation_duplicate",
        requestId: REQUEST_ID,
        originalType: "start_preview",
      }),
    ).toBe(false);
  });
});
