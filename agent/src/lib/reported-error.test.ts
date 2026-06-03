// Verifies the "already reported" marker so the queue catch can dedupe errors.
import { describe, it, expect } from "vitest";
import { markErrorReported, isErrorReported } from "./reported-error.js";

describe("reported-error", () => {
  it("marks and detects an Error instance", () => {
    const err = new Error("boom");
    expect(isErrorReported(err)).toBe(false);
    markErrorReported(err);
    expect(isErrorReported(err)).toBe(true);
  });

  it("is false for unmarked errors and non-objects", () => {
    expect(isErrorReported(new Error("x"))).toBe(false);
    expect(isErrorReported("string error")).toBe(false);
    expect(isErrorReported(null)).toBe(false);
    expect(isErrorReported(undefined)).toBe(false);
  });

  it("does not throw when marking a non-object", () => {
    expect(() => markErrorReported("nope")).not.toThrow();
    expect(() => markErrorReported(null)).not.toThrow();
  });
});
