// Verifies optional AGENT_LOCAL_TOKEN gate for HTTP and WebSocket.
import { afterEach, describe, expect, it } from "vitest";
import {
  describeInsecureBind,
  isLocalAuthEnabled,
  isLoopbackBindHost,
  verifyHttpToken,
  verifyWsToken,
} from "./local-auth.js";

describe("bind safety", () => {
  it("treats loopback hosts as safe", () => {
    for (const host of ["127.0.0.1", "localhost", "::1", "127.0.0.5", " LOCALHOST "]) {
      expect(isLoopbackBindHost(host)).toBe(true);
    }
  });

  it("treats LAN / all-interfaces hosts as non-loopback", () => {
    for (const host of ["0.0.0.0", "192.168.1.50", "10.0.0.2", "::", "example.lan"]) {
      expect(isLoopbackBindHost(host)).toBe(false);
    }
  });

  it("warns only on a non-loopback bind without auth", () => {
    expect(describeInsecureBind("0.0.0.0", false)).toMatch(/non-loopback/i);
    expect(describeInsecureBind("192.168.1.50", false)).toMatch(/AGENT_LOCAL_TOKEN/);
    // Safe: loopback, or auth enabled.
    expect(describeInsecureBind("127.0.0.1", false)).toBeNull();
    expect(describeInsecureBind("0.0.0.0", true)).toBeNull();
  });
});

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
