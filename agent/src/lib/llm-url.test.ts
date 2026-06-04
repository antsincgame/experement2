import { describe, it, expect, afterEach, vi } from "vitest";
import { assertLlmUrl, llmFetch, normalizeLmStudioUrl } from "./llm-url.js";

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
  });

  it("rewrites private LAN URLs to loopback (LM Studio Reachable-at address)", () => {
    expect(normalizeLmStudioUrl("http://10.25.0.6:1234")).toBe("http://127.0.0.1:1234");
    expect(assertLlmUrl("http://10.25.0.6:1234")).toBe("http://127.0.0.1:1234");
  });

  it("rejects non-http(s) protocols and malformed URLs", () => {
    expect(() => assertLlmUrl("file:///etc/passwd")).toThrow();
    expect(() => assertLlmUrl("ftp://localhost")).toThrow();
    expect(() => assertLlmUrl("not a url")).toThrow(/Invalid LLM URL/);
  });
});

describe("normalizeLmStudioUrl respects the env allowlist", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("keeps a LAN host that is explicitly allowlisted (intentional remote server)", async () => {
    vi.stubEnv("LM_STUDIO_ALLOWED_HOSTS", "10.25.0.6");
    vi.resetModules();
    const mod = await import("./llm-url.js");
    // Allowlisted → treated as a deliberate remote model server, not rewritten.
    expect(mod.normalizeLmStudioUrl("http://10.25.0.6:1234")).toBe("http://10.25.0.6:1234");
    expect(mod.assertLlmUrl("http://10.25.0.6:1234")).toBe("http://10.25.0.6:1234");
  });

  it("still rewrites a different LAN host that is NOT allowlisted", async () => {
    vi.stubEnv("LM_STUDIO_ALLOWED_HOSTS", "10.25.0.6");
    vi.resetModules();
    const mod = await import("./llm-url.js");
    expect(mod.normalizeLmStudioUrl("http://192.168.1.50:1234")).toBe("http://127.0.0.1:1234");
  });
});

describe("llmFetch (SSRF redirect guard)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("pins redirect:'manual' and returns a normal response", async () => {
    const ok = { status: 200, type: "default", ok: true } as unknown as Response;
    const spy = vi.fn().mockResolvedValue(ok);
    vi.stubGlobal("fetch", spy);

    await expect(llmFetch("http://127.0.0.1:1234/v1/models")).resolves.toBe(ok);
    expect(spy).toHaveBeenCalledWith(
      "http://127.0.0.1:1234/v1/models",
      expect.objectContaining({ redirect: "manual" })
    );
  });

  it("rejects an opaque redirect (manual-mode response)", async () => {
    const redirect = { status: 0, type: "opaqueredirect", ok: false } as unknown as Response;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(redirect));
    await expect(llmFetch("http://127.0.0.1:1234/v1/models")).rejects.toThrow(/LLM_REDIRECT_BLOCKED/);
  });

  it("rejects an exposed 3xx redirect", async () => {
    const redirect = { status: 302, type: "default", ok: false } as unknown as Response;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(redirect));
    await expect(llmFetch("http://127.0.0.1:1234/v1/models")).rejects.toThrow(/LLM_REDIRECT_BLOCKED/);
  });

  it("preserves caller init (method/signal) while pinning redirect", async () => {
    const ok = { status: 200, type: "default", ok: true } as unknown as Response;
    const spy = vi.fn().mockResolvedValue(ok);
    vi.stubGlobal("fetch", spy);
    const controller = new AbortController();

    await llmFetch("http://127.0.0.1:1234/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
    });

    expect(spy).toHaveBeenCalledWith(
      "http://127.0.0.1:1234/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        redirect: "manual",
        signal: controller.signal,
      })
    );
  });
});
