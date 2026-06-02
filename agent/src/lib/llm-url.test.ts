import { describe, it, expect } from "vitest";
import { assertLlmUrl } from "./llm-url.js";

// These tests assume LM_STUDIO_URL / LM_STUDIO_ALLOWED_HOSTS are unset in the
// test environment, so only loopback hosts are permitted.
describe("assertLlmUrl", () => {
  it("allows loopback hosts and returns a normalized origin (no path/query)", () => {
    expect(assertLlmUrl("http://localhost:1234")).toBe("http://localhost:1234");
    expect(assertLlmUrl("http://127.0.0.1:1234/v1/models")).toBe("http://127.0.0.1:1234");
    expect(assertLlmUrl("http://localhost:1234/")).toBe("http://localhost:1234");
  });

  it("rejects non-loopback hosts (SSRF guard)", () => {
    expect(() => assertLlmUrl("http://169.254.169.254/latest/meta-data")).toThrow(/not allowed/);
    expect(() => assertLlmUrl("http://evil.example.com")).toThrow(/not allowed/);
    expect(() => assertLlmUrl("http://10.0.0.5:1234")).toThrow(/not allowed/);
  });

  it("rejects non-http(s) protocols and malformed URLs", () => {
    expect(() => assertLlmUrl("file:///etc/passwd")).toThrow();
    expect(() => assertLlmUrl("ftp://localhost")).toThrow();
    expect(() => assertLlmUrl("not a url")).toThrow(/Invalid LLM URL/);
  });
});
