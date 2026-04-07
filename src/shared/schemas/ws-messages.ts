// Defines stricter WebSocket protocol contracts so build and preview state stay scoped and debuggable.
import { z } from "zod";

const RequestIdSchema = z.string().uuid();
const ProjectNameSchema = z.string().min(1);
const BuildIdSchema = z.string().uuid();
export const ProjectStatusSchema = z.enum([
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
export const PreviewStatusSchema = z.enum([
  "stopped",
  "starting",
  "ready",
  "error",
]);

const RequestScopedMessageSchema = z.object({
  requestId: RequestIdSchema,
});

const OperationScopedMessageSchema = RequestScopedMessageSchema.extend({
  projectName: ProjectNameSchema.optional(),
});

const LooseOperationScopedMessageSchema = z.object({
  projectName: ProjectNameSchema.optional(),
  requestId: RequestIdSchema.optional(),
});

const ProjectScopedMessageSchema = RequestScopedMessageSchema.extend({
  projectName: ProjectNameSchema,
});

const BuildScopedMessageSchema = ProjectScopedMessageSchema.extend({
  buildId: BuildIdSchema,
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
  status: ProjectStatusSchema,
  previewStatus: PreviewStatusSchema.optional(),
  buildId: BuildIdSchema.optional(),
}).merge(OperationScopedMessageSchema);

export const PlanChunkMessageSchema = z.object({
  type: z.literal("plan_chunk"),
  chunk: z.string(),
}).merge(OperationScopedMessageSchema);

export const PlanCompleteMessageSchema = z.object({
  type: z.literal("plan_complete"),
  plan: z.record(z.string(), z.unknown()),
}).merge(OperationScopedMessageSchema);

export const ScaffoldCompleteMessageSchema = z.object({
  type: z.literal("scaffold_complete"),
}).merge(ProjectScopedMessageSchema);

export const FileGeneratingMessageSchema = z.object({
  type: z.literal("file_generating"),
  filepath: z.string(),
  progress: z.number(),
}).merge(ProjectScopedMessageSchema);

export const CodeChunkMessageSchema = z.object({
  type: z.literal("code_chunk"),
  chunk: z.string(),
}).merge(ProjectScopedMessageSchema);

export const FileCompleteMessageSchema = z.object({
  type: z.literal("file_complete"),
  filepath: z.string(),
}).merge(ProjectScopedMessageSchema);

export const GenerationCompleteMessageSchema = z.object({
  type: z.literal("generation_complete"),
  filesCount: z.number(),
}).merge(ProjectScopedMessageSchema);

export const BuildEventMessageSchema = z.object({
  type: z.literal("build_event"),
  eventType: z.string(),
  message: z.string().optional(),
  error: z.string().optional(),
  buildId: BuildIdSchema.optional(),
  previewStatus: PreviewStatusSchema.optional(),
}).merge(OperationScopedMessageSchema);

export const PreviewStatusMessageSchema = z.object({
  type: z.literal("preview_status"),
  previewStatus: PreviewStatusSchema,
  error: z.string().optional(),
}).merge(BuildScopedMessageSchema);

export const PreviewReadyMessageSchema = z.object({
  type: z.literal("preview_ready"),
  port: z.number(),
  proxyUrl: z.string(),
}).merge(BuildScopedMessageSchema);

export const ThinkingMessageSchema = z.object({
  type: z.literal("thinking"),
  content: z.string(),
}).merge(ProjectScopedMessageSchema);

export const AnalysisCompleteMessageSchema = z.object({
  type: z.literal("analysis_complete"),
  files: z.array(z.string()).optional(),
  thinking: z.string().optional(),
}).merge(ProjectScopedMessageSchema);

export const FileDiffMessageSchema = z.object({
  type: z.literal("file_diff"),
  filepath: z.string(),
  before: z.string(),
  after: z.string(),
}).merge(ProjectScopedMessageSchema);

export const BlockAppliedMessageSchema = z.object({
  type: z.literal("block_applied"),
  filepath: z.string(),
  blockType: z.string().optional(),
}).merge(ProjectScopedMessageSchema);

export const IterationCompleteMessageSchema = z.object({
  type: z.literal("iteration_complete"),
  applied: z.number(),
  failed: z.number(),
  errors: z.array(z.string()).optional(),
}).merge(ProjectScopedMessageSchema);

export const VersionCreatedMessageSchema = z.object({
  type: z.literal("version_created"),
  version: z.number(),
  hash: z.string(),
  description: z.string(),
}).merge(ProjectScopedMessageSchema);

export const AutofixStartMessageSchema = z.object({
  type: z.literal("autofix_start"),
  file: z.string().optional(),
  error: z.string(),
  buildId: BuildIdSchema.optional(),
}).merge(ProjectScopedMessageSchema);

export const AutofixSuccessMessageSchema = z.object({
  type: z.literal("autofix_success"),
  attempts: z.number(),
  buildId: BuildIdSchema.optional(),
}).merge(ProjectScopedMessageSchema);

export const AutofixFailedMessageSchema = z.object({
  type: z.literal("autofix_failed"),
  attempts: z.number(),
  error: z.string().optional(),
  file: z.string().optional(),
  buildId: BuildIdSchema.optional(),
}).merge(ProjectScopedMessageSchema);

export const ReloadingPreviewMessageSchema = z.object({
  type: z.literal("reloading_preview"),
}).merge(ProjectScopedMessageSchema);

export const SystemErrorMessageSchema = z.object({
  type: z.literal("system_error"),
  error: z.string(),
  file: z.string().optional(),
  step: z.string().optional(),
  buildId: BuildIdSchema.optional(),
}).merge(LooseOperationScopedMessageSchema);

export const GenerationAbortedMessageSchema = z.object({
  type: z.literal("generation_aborted"),
}).merge(OperationScopedMessageSchema);

export const ProjectCreatedMessageSchema = z.object({
  type: z.literal("project_created"),
  port: z.number(),
  plan: z.record(z.string(), z.unknown()).optional(),
}).merge(ProjectScopedMessageSchema);

export const IterationResultMessageSchema = z.object({
  type: z.literal("iteration_result"),
  appliedBlocks: z.number().optional(),
  failedBlocks: z.number().optional(),
  errors: z.array(z.string()).optional(),
}).merge(ProjectScopedMessageSchema);

export const AutofixAttemptMessageSchema = z.object({
  type: z.literal("autofix_attempt"),
  attempt: z.number(),
  maxAttempts: z.number(),
  buildId: BuildIdSchema.optional(),
}).merge(ProjectScopedMessageSchema);

export const AutofixBlockMessageSchema = z.object({
  type: z.literal("autofix_block"),
  filepath: z.string(),
  buildId: BuildIdSchema.optional(),
}).merge(ProjectScopedMessageSchema);

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
  PreviewStatusMessageSchema,
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
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;
export type PreviewStatus = z.infer<typeof PreviewStatusSchema>;

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
