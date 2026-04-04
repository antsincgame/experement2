// Defines typed WebSocket payloads so the client can validate and handle agent events safely.
import { z } from "zod";

const RequestIdSchema = z.string().uuid();
const ProjectNameSchema = z.string().min(1);
const AppStatusSchema = z.enum([
  "idle",
  "planning",
  "scaffolding",
  "generating",
  "building",
  "analyzing",
  "validating",
  "ready",
  "error",
]);

const ScopedMessageSchema = z.object({
  projectName: ProjectNameSchema.optional(),
  requestId: RequestIdSchema.optional(),
});

const UserAssistantMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

export const ConnectedMessageSchema = z.object({
  type: z.literal("connected"),
  clientId: z.string(),
  timestamp: z.number(),
});

export const StatusMessageSchema = z.object({
  type: z.literal("status"),
  status: AppStatusSchema,
}).merge(ScopedMessageSchema);

export const PlanChunkMessageSchema = z.object({
  type: z.literal("plan_chunk"),
  chunk: z.string(),
}).merge(ScopedMessageSchema);

export const PlanCompleteMessageSchema = z.object({
  type: z.literal("plan_complete"),
  plan: z.record(z.string(), z.unknown()),
}).merge(ScopedMessageSchema);

export const ScaffoldCompleteMessageSchema = z.object({
  type: z.literal("scaffold_complete"),
  projectName: ProjectNameSchema,
  requestId: RequestIdSchema.optional(),
});

export const FileGeneratingMessageSchema = z.object({
  type: z.literal("file_generating"),
  filepath: z.string(),
  progress: z.number(),
}).merge(ScopedMessageSchema);

export const CodeChunkMessageSchema = z.object({
  type: z.literal("code_chunk"),
  chunk: z.string(),
}).merge(ScopedMessageSchema);

export const FileCompleteMessageSchema = z.object({
  type: z.literal("file_complete"),
  filepath: z.string(),
}).merge(ScopedMessageSchema);

export const GenerationCompleteMessageSchema = z.object({
  type: z.literal("generation_complete"),
  filesCount: z.number(),
}).merge(ScopedMessageSchema);

export const BuildEventMessageSchema = z.object({
  type: z.literal("build_event"),
  eventType: z.string(),
  message: z.string().optional(),
  error: z.string().optional(),
}).merge(ScopedMessageSchema);

export const PreviewReadyMessageSchema = z.object({
  type: z.literal("preview_ready"),
  projectName: ProjectNameSchema,
  port: z.number(),
  proxyUrl: z.string(),
  requestId: RequestIdSchema.optional(),
});

export const ThinkingMessageSchema = z.object({
  type: z.literal("thinking"),
  content: z.string(),
}).merge(ScopedMessageSchema);

export const AnalysisCompleteMessageSchema = z.object({
  type: z.literal("analysis_complete"),
  files: z.array(z.string()).optional(),
  thinking: z.string().optional(),
}).merge(ScopedMessageSchema);

export const FileDiffMessageSchema = z.object({
  type: z.literal("file_diff"),
  filepath: z.string(),
  before: z.string(),
  after: z.string(),
}).merge(ScopedMessageSchema);

export const BlockAppliedMessageSchema = z.object({
  type: z.literal("block_applied"),
  filepath: z.string(),
  blockType: z.string().optional(),
}).merge(ScopedMessageSchema);

export const IterationCompleteMessageSchema = z.object({
  type: z.literal("iteration_complete"),
  applied: z.number(),
  failed: z.number(),
  errors: z.array(z.string()).optional(),
}).merge(ScopedMessageSchema);

export const VersionCreatedMessageSchema = z.object({
  type: z.literal("version_created"),
  version: z.number(),
  hash: z.string(),
  description: z.string(),
}).merge(ScopedMessageSchema);

export const AutofixStartMessageSchema = z.object({
  type: z.literal("autofix_start"),
  file: z.string().optional(),
  error: z.string(),
}).merge(ScopedMessageSchema);

export const AutofixSuccessMessageSchema = z.object({
  type: z.literal("autofix_success"),
  attempts: z.number(),
}).merge(ScopedMessageSchema);

export const AutofixFailedMessageSchema = z.object({
  type: z.literal("autofix_failed"),
  attempts: z.number(),
  error: z.string().optional(),
  file: z.string().optional(),
}).merge(ScopedMessageSchema);

export const ReloadingPreviewMessageSchema = z.object({
  type: z.literal("reloading_preview"),
}).merge(ScopedMessageSchema);

export const SystemErrorMessageSchema = z.object({
  type: z.literal("system_error"),
  error: z.string(),
  file: z.string().optional(),
  step: z.string().optional(),
}).merge(ScopedMessageSchema);

export const GenerationAbortedMessageSchema = z.object({
  type: z.literal("generation_aborted"),
}).merge(ScopedMessageSchema);

export const ProjectCreatedMessageSchema = z.object({
  type: z.literal("project_created"),
  projectName: ProjectNameSchema,
  port: z.number(),
  plan: z.record(z.string(), z.unknown()).optional(),
}).merge(ScopedMessageSchema);

export const IterationResultMessageSchema = z.object({
  type: z.literal("iteration_result"),
  appliedBlocks: z.number().optional(),
  failedBlocks: z.number().optional(),
  errors: z.array(z.string()).optional(),
}).merge(ScopedMessageSchema);

export const AutofixAttemptMessageSchema = z.object({
  type: z.literal("autofix_attempt"),
  attempt: z.number(),
  maxAttempts: z.number(),
}).merge(ScopedMessageSchema);

export const AutofixBlockMessageSchema = z.object({
  type: z.literal("autofix_block"),
  filepath: z.string(),
}).merge(ScopedMessageSchema);

export const LlmServerStatusMessageSchema = z.object({
  type: z.enum(["lm_studio_status", "llm_server_status"]),
  status: z.enum(["connected", "disconnected", "checking"]),
});

export const IncomingWsMessageSchema = z.discriminatedUnion("type", [
  ConnectedMessageSchema,
  StatusMessageSchema,
  PlanChunkMessageSchema,
  PlanCompleteMessageSchema,
  ScaffoldCompleteMessageSchema,
  FileGeneratingMessageSchema,
  CodeChunkMessageSchema,
  FileCompleteMessageSchema,
  GenerationCompleteMessageSchema,
  BuildEventMessageSchema,
  PreviewReadyMessageSchema,
  ThinkingMessageSchema,
  AnalysisCompleteMessageSchema,
  FileDiffMessageSchema,
  BlockAppliedMessageSchema,
  IterationCompleteMessageSchema,
  VersionCreatedMessageSchema,
  AutofixStartMessageSchema,
  AutofixSuccessMessageSchema,
  AutofixFailedMessageSchema,
  ReloadingPreviewMessageSchema,
  SystemErrorMessageSchema,
  GenerationAbortedMessageSchema,
  ProjectCreatedMessageSchema,
  IterationResultMessageSchema,
  AutofixAttemptMessageSchema,
  AutofixBlockMessageSchema,
  LlmServerStatusMessageSchema,
]);

export type IncomingWsMessage = z.infer<typeof IncomingWsMessageSchema>;

const OutgoingScopedMessageSchema = z.object({
  requestId: RequestIdSchema,
});

export const OutgoingWsMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create_project"),
    description: z.string().min(1),
    lmStudioUrl: z.string().optional(),
    model: z.string().optional(),
    temperature: z.number().optional(),
    maxTokens: z.number().optional(),
  }).merge(OutgoingScopedMessageSchema),
  z.object({
    type: z.literal("iterate"),
    projectName: ProjectNameSchema,
    userRequest: z.string().min(1),
    chatHistory: UserAssistantMessageSchema.array(),
    lmStudioUrl: z.string().optional(),
    model: z.string().optional(),
    temperature: z.number().optional(),
    maxTokens: z.number().optional(),
  }).merge(OutgoingScopedMessageSchema),
  z.object({
    type: z.literal("start_preview"),
    projectName: ProjectNameSchema,
    lmStudioUrl: z.string().optional(),
    model: z.string().optional(),
  }).merge(OutgoingScopedMessageSchema),
  z.object({
    type: z.literal("abort_generation"),
  }).merge(OutgoingScopedMessageSchema),
  z.object({
    type: z.literal("revert_version"),
    projectName: ProjectNameSchema,
    commitHash: z.string().min(7),
    lmStudioUrl: z.string().optional(),
    model: z.string().optional(),
  }).merge(OutgoingScopedMessageSchema),
]);

export type OutgoingWsMessage = z.infer<typeof OutgoingWsMessageSchema>;

export const parseIncomingWsMessage = (
  payload: unknown
): IncomingWsMessage | null => {
  const parsed = IncomingWsMessageSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
};
