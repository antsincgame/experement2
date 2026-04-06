// Defines strict Zod schemas for every HTTP and WebSocket payload, including model/runtime overrides.
import path from "path";
import { z } from "zod";

const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

const emptyStringToUndefined = (value: unknown): unknown => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
};

const trimmedString = (fieldName: string, maxLength = 20_000) =>
  z.string().trim()
    .min(1, `${fieldName} is required`)
    .max(maxLength, `${fieldName} is too long`);

const isHttpUrl = (value: string): boolean => {
  const protocol = new URL(value).protocol;
  return HTTP_PROTOCOLS.has(protocol);
};

export const HttpUrlSchema = z.string().trim()
  .url("Expected a valid URL")
  .refine(isHttpUrl, "URL must use http:// or https://")
  .transform((value) => value.replace(/\/+$/, ""));

export const OptionalHttpUrlSchema = z.preprocess(
  emptyStringToUndefined,
  HttpUrlSchema.optional()
);

const OptionalModelSchema = z.preprocess(
  emptyStringToUndefined,
  z.string().trim()
    .min(1, "model must not be empty")
    .max(200, "model is too long")
    .optional()
);

const safePathSegment = (fieldName: string) =>
  trimmedString(fieldName, 120)
    .refine(
      (value) => path.basename(value) === value,
      `${fieldName} must be a single path segment`
    )
    .refine(
      (value) => value !== "." && value !== "..",
      `${fieldName} must not be a dot path`
    )
    .refine(
      (value) => !value.includes("\0"),
      `${fieldName} contains invalid characters`
    );

export const ProjectNameSchema = safePathSegment("projectName");
export const ProjectParamsSchema = z.object({ name: ProjectNameSchema });

export const ProjectFilePathSchema = trimmedString("path", 500)
  .refine((value) => !path.isAbsolute(value), "path must be relative")
  .refine((value) => !value.includes("\0"), "path contains invalid characters");

export const ProjectFileQuerySchema = z.object({
  path: ProjectFilePathSchema,
});

const RequestIdSchema = z.string().uuid("requestId must be a UUID");
const WsRequestMetadataSchema = z.object({
  requestId: RequestIdSchema.optional(),
});

const UserAssistantMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: trimmedString("content", 50_000),
});

const LlmMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: trimmedString("content", 50_000),
});

const ResponseFormatSchema = z.object({
  type: z.literal("json_object"),
});

export const LlmEnhanceBodySchema = z.object({
  prompt: trimmedString("prompt", 10_000),
  model: OptionalModelSchema,
  lmStudioUrl: OptionalHttpUrlSchema,
});

export const LlmCompleteBodySchema = z.object({
  messages: z.array(LlmMessageSchema)
    .min(1, "messages must contain at least one item")
    .max(200, "messages is too long"),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().max(131_072).optional(),
  stream: z.boolean().optional(),
  response_format: ResponseFormatSchema.optional(),
  model: OptionalModelSchema,
  lmStudioUrl: OptionalHttpUrlSchema,
});

const CommitHashSchema = z.string().trim().regex(
  /^[a-f0-9]{7,64}$/i,
  "commitHash must be a git hash (7-64 hex chars)"
);

export const WsAbortGenerationSchema = z.object({
  type: z.literal("abort_generation"),
}).merge(WsRequestMetadataSchema);

export const WsCreateProjectSchema = z.object({
  type: z.literal("create_project"),
  description: trimmedString("description", 20_000),
  lmStudioUrl: OptionalHttpUrlSchema,
  model: OptionalModelSchema,
  plannerModel: OptionalModelSchema,
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().max(131_072).optional(),
}).merge(WsRequestMetadataSchema);

export const WsIterateSchema = z.object({
  type: z.literal("iterate"),
  projectName: ProjectNameSchema,
  userRequest: trimmedString("userRequest", 20_000),
  chatHistory: z.array(UserAssistantMessageSchema)
    .max(200, "chatHistory is too long")
    .default([]),
  lmStudioUrl: OptionalHttpUrlSchema,
  model: OptionalModelSchema,
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().max(131_072).optional(),
}).merge(WsRequestMetadataSchema);

export const WsStartPreviewSchema = z.object({
  type: z.literal("start_preview"),
  projectName: ProjectNameSchema,
  lmStudioUrl: OptionalHttpUrlSchema,
  model: OptionalModelSchema,
}).merge(WsRequestMetadataSchema);

export const WsRevertVersionSchema = z.object({
  type: z.literal("revert_version"),
  projectName: ProjectNameSchema,
  commitHash: CommitHashSchema,
  lmStudioUrl: OptionalHttpUrlSchema,
  model: OptionalModelSchema,
}).merge(WsRequestMetadataSchema);

export const WsMessageSchema = z.discriminatedUnion("type", [
  WsAbortGenerationSchema,
  WsCreateProjectSchema,
  WsIterateSchema,
  WsStartPreviewSchema,
  WsRevertVersionSchema,
]);

export type WsMessage = z.infer<typeof WsMessageSchema>;
