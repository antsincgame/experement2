import { afterEach, describe, expect, it } from "vitest";
import { getAllowedOrigins, isOriginAllowed } from "./origin-allowlist.js";

describe("isOriginAllowed", () => {
  const allowed = ["http://localhost:8081"];

  it("allows an allow-listed origin", () => {
    expect(isOriginAllowed("http://localhost:8081", allowed)).toBe(true);
  });

  it("rejects an origin that is present but not allow-listed (malicious page)", () => {
    expect(isOriginAllowed("http://evil.example.com", allowed)).toBe(false);
    expect(isOriginAllowed("https://attacker.test", allowed)).toBe(false);
  });

  it("allows any loopback http port in default dev mode", () => {
    const original = process.env.AGENT_ALLOWED_ORIGINS;
    delete process.env.AGENT_ALLOWED_ORIGINS;
    expect(isOriginAllowed("http://localhost:8099", ["http://localhost:8081"])).toBe(true);
    expect(isOriginAllowed("http://127.0.0.1:19006", ["http://localhost:8081"])).toBe(true);
    if (original === undefined) {
      delete process.env.AGENT_ALLOWED_ORIGINS;
    } else {
      process.env.AGENT_ALLOWED_ORIGINS = original;
    }
  });

  it("allows clients that send no Origin (native/CLI — not the cross-site threat)", () => {
    expect(isOriginAllowed(undefined, allowed)).toBe(true);
    expect(isOriginAllowed("", allowed)).toBe(true);
    expect(isOriginAllowed(null, allowed)).toBe(true);
  });
});

describe("getAllowedOrigins", () => {
  const original = process.env.AGENT_ALLOWED_ORIGINS;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.AGENT_ALLOWED_ORIGINS;
    } else {
      process.env.AGENT_ALLOWED_ORIGINS = original;
    }
  });

  it("parses AGENT_ALLOWED_ORIGINS as a trimmed csv", () => {
    process.env.AGENT_ALLOWED_ORIGINS = "http://a:8081, http://b:9000 ,";
    expect(getAllowedOrigins()).toEqual(["http://a:8081", "http://b:9000"]);
  });

  it("falls back to localhost defaults when unset", () => {
    delete process.env.AGENT_ALLOWED_ORIGINS;
    expect(getAllowedOrigins()).toEqual([
      "http://localhost:8081",
      "http://localhost:8082",
      "http://127.0.0.1:8081",
      "http://127.0.0.1:8082",
    ]);
  });
});
