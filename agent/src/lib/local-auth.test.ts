// Verifies optional AGENT_LOCAL_TOKEN gate for HTTP and WebSocket.
import { afterEach, describe, expect, it } from "vitest";
import {
  isLocalAuthEnabled,
  verifyHttpToken,
  verifyWsToken,
} from "./local-auth.js";

describe("local-auth", () => {
  afterEach(() => {
    delete process.env.AGENT_LOCAL_TOKEN;
  });

  it("is disabled when AGENT_LOCAL_TOKEN is unset", () => {
    expect(isLocalAuthEnabled()).toBe(false);
    expect(
      verifyHttpToken({
        headers: {},
      } as import("node:http").IncomingMessage),
    ).toBe(true);
  });

  it("requires matching X-Agent-Token on HTTP when enabled", () => {
    process.env.AGENT_LOCAL_TOKEN = "secret-token";
    expect(
      verifyHttpToken({
        headers: { "x-agent-token": "secret-token" },
      } as import("node:http").IncomingMessage),
    ).toBe(true);
    expect(
      verifyHttpToken({
        headers: { "x-agent-token": "wrong" },
      } as import("node:http").IncomingMessage),
    ).toBe(false);
  });

  it("reads token from WebSocket query param when enabled", () => {
    process.env.AGENT_LOCAL_TOKEN = "ws-secret";
    expect(
      verifyWsToken({
        url: "/?token=ws-secret",
        headers: {},
      } as import("node:http").IncomingMessage),
    ).toBe(true);
    expect(
      verifyWsToken({
        url: "/?token=nope",
        headers: {},
      } as import("node:http").IncomingMessage),
    ).toBe(false);
  });
});
