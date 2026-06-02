import { describe, it, expect } from "vitest";
import { z } from "zod";
import type { Response } from "express";
import {
  formatZodError,
  parseOrRespond,
  respondInvalidInput,
} from "./request-validation.js";

interface FakeRes {
  statusCode: number;
  body: unknown;
  status(code: number): FakeRes;
  json(payload: unknown): FakeRes;
}

const makeRes = (): FakeRes => {
  const res: FakeRes = {
    statusCode: 0,
    body: undefined,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(payload) {
      res.body = payload;
      return res;
    },
  };
  return res;
};

const asResponse = (res: FakeRes): Response => res as unknown as Response;

describe("formatZodError", () => {
  it("joins issues with their dotted path", () => {
    const result = z.object({ a: z.string(), b: z.number() }).safeParse({ a: 1, b: "x" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = formatZodError(result.error);
      expect(msg).toContain("a:");
      expect(msg).toContain("b:");
      expect(msg).toContain(";");
    }
  });

  it("labels top-level (pathless) issues as 'request'", () => {
    const result = z.string().safeParse(123);
    if (!result.success) {
      expect(formatZodError(result.error)).toContain("request:");
    }
  });
});

describe("parseOrRespond", () => {
  const schema = z.object({ name: z.string() });

  it("returns parsed data and leaves res untouched on success", () => {
    const res = makeRes();
    const data = parseOrRespond(schema, { name: "ok" }, asResponse(res));
    expect(data).toEqual({ name: "ok" });
    expect(res.statusCode).toBe(0);
  });

  it("responds 400 INVALID_INPUT and returns null on failure", () => {
    const res = makeRes();
    const data = parseOrRespond(schema, { name: 123 }, asResponse(res));
    expect(data).toBeNull();
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ code: "INVALID_INPUT" });
  });
});

describe("respondInvalidInput", () => {
  it("sets a 400 with the formatted message", () => {
    const res = makeRes();
    const result = z.object({ x: z.string() }).safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      respondInvalidInput(asResponse(res), result.error);
    }
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ code: "INVALID_INPUT" });
    expect((res.body as { error: string }).error).toContain("x:");
  });
});
