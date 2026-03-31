// Formats Zod validation failures into stable HTTP and WS error messages.
import type { Response } from "express";
import { z } from "zod";

export const formatZodError = (error: z.ZodError): string =>
  error.issues
    .map((issue) => {
      const location = issue.path.length > 0
        ? issue.path.join(".")
        : "request";
      return `${location}: ${issue.message}`;
    })
    .join("; ");

export const respondInvalidInput = (
  res: Response,
  error: z.ZodError
): void => {
  res.status(400).json({
    error: formatZodError(error),
    code: "INVALID_INPUT",
  });
};

export const parseOrRespond = <T extends z.ZodTypeAny>(
  schema: T,
  input: unknown,
  res: Response
): z.infer<T> | null => {
  const parsed = schema.safeParse(input);

  if (!parsed.success) {
    respondInvalidInput(res, parsed.error);
    return null;
  }

  return parsed.data;
};
