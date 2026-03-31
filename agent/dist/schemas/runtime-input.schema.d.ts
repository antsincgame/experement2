import { z } from "zod";
export declare const HttpUrlSchema: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>;
export declare const OptionalHttpUrlSchema: z.ZodEffects<z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>>, string | undefined, unknown>;
export declare const ProjectNameSchema: z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>, string, string>;
export declare const ProjectParamsSchema: z.ZodObject<{
    name: z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>, string, string>;
}, "strip", z.ZodTypeAny, {
    name: string;
}, {
    name: string;
}>;
export declare const ProjectFilePathSchema: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>;
export declare const ProjectFileQuerySchema: z.ZodObject<{
    path: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>;
}, "strip", z.ZodTypeAny, {
    path: string;
}, {
    path: string;
}>;
export declare const LlmEnhanceBodySchema: z.ZodObject<{
    prompt: z.ZodString;
    model: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
    lmStudioUrl: z.ZodEffects<z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>>, string | undefined, unknown>;
}, "strip", z.ZodTypeAny, {
    prompt: string;
    model?: string | undefined;
    lmStudioUrl?: string | undefined;
}, {
    prompt: string;
    model?: unknown;
    lmStudioUrl?: unknown;
}>;
export declare const LlmCompleteBodySchema: z.ZodObject<{
    messages: z.ZodArray<z.ZodObject<{
        role: z.ZodEnum<["system", "user", "assistant"]>;
        content: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        content: string;
        role: "user" | "assistant" | "system";
    }, {
        content: string;
        role: "user" | "assistant" | "system";
    }>, "many">;
    temperature: z.ZodOptional<z.ZodNumber>;
    max_tokens: z.ZodOptional<z.ZodNumber>;
    stream: z.ZodOptional<z.ZodBoolean>;
    response_format: z.ZodOptional<z.ZodObject<{
        type: z.ZodLiteral<"json_object">;
    }, "strip", z.ZodTypeAny, {
        type: "json_object";
    }, {
        type: "json_object";
    }>>;
    model: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
    lmStudioUrl: z.ZodEffects<z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>>, string | undefined, unknown>;
}, "strip", z.ZodTypeAny, {
    messages: {
        content: string;
        role: "user" | "assistant" | "system";
    }[];
    model?: string | undefined;
    lmStudioUrl?: string | undefined;
    temperature?: number | undefined;
    max_tokens?: number | undefined;
    stream?: boolean | undefined;
    response_format?: {
        type: "json_object";
    } | undefined;
}, {
    messages: {
        content: string;
        role: "user" | "assistant" | "system";
    }[];
    model?: unknown;
    lmStudioUrl?: unknown;
    temperature?: number | undefined;
    max_tokens?: number | undefined;
    stream?: boolean | undefined;
    response_format?: {
        type: "json_object";
    } | undefined;
}>;
export declare const WsAbortGenerationSchema: z.ZodObject<{
    type: z.ZodLiteral<"abort_generation">;
}, "strip", z.ZodTypeAny, {
    type: "abort_generation";
}, {
    type: "abort_generation";
}>;
export declare const WsCreateProjectSchema: z.ZodObject<{
    type: z.ZodLiteral<"create_project">;
    description: z.ZodString;
    lmStudioUrl: z.ZodEffects<z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>>, string | undefined, unknown>;
}, "strip", z.ZodTypeAny, {
    type: "create_project";
    description: string;
    lmStudioUrl?: string | undefined;
}, {
    type: "create_project";
    description: string;
    lmStudioUrl?: unknown;
}>;
export declare const WsIterateSchema: z.ZodObject<{
    type: z.ZodLiteral<"iterate">;
    projectName: z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>, string, string>;
    userRequest: z.ZodString;
    chatHistory: z.ZodDefault<z.ZodArray<z.ZodObject<{
        role: z.ZodEnum<["user", "assistant"]>;
        content: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        content: string;
        role: "user" | "assistant";
    }, {
        content: string;
        role: "user" | "assistant";
    }>, "many">>;
    lmStudioUrl: z.ZodEffects<z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>>, string | undefined, unknown>;
}, "strip", z.ZodTypeAny, {
    type: "iterate";
    projectName: string;
    userRequest: string;
    chatHistory: {
        content: string;
        role: "user" | "assistant";
    }[];
    lmStudioUrl?: string | undefined;
}, {
    type: "iterate";
    projectName: string;
    userRequest: string;
    lmStudioUrl?: unknown;
    chatHistory?: {
        content: string;
        role: "user" | "assistant";
    }[] | undefined;
}>;
export declare const WsStartPreviewSchema: z.ZodObject<{
    type: z.ZodLiteral<"start_preview">;
    projectName: z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>, string, string>;
    lmStudioUrl: z.ZodEffects<z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>>, string | undefined, unknown>;
}, "strip", z.ZodTypeAny, {
    type: "start_preview";
    projectName: string;
    lmStudioUrl?: string | undefined;
}, {
    type: "start_preview";
    projectName: string;
    lmStudioUrl?: unknown;
}>;
export declare const WsRevertVersionSchema: z.ZodObject<{
    type: z.ZodLiteral<"revert_version">;
    projectName: z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>, string, string>;
    commitHash: z.ZodString;
    lmStudioUrl: z.ZodEffects<z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>>, string | undefined, unknown>;
}, "strip", z.ZodTypeAny, {
    type: "revert_version";
    projectName: string;
    commitHash: string;
    lmStudioUrl?: string | undefined;
}, {
    type: "revert_version";
    projectName: string;
    commitHash: string;
    lmStudioUrl?: unknown;
}>;
export declare const WsMessageSchema: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
    type: z.ZodLiteral<"abort_generation">;
}, "strip", z.ZodTypeAny, {
    type: "abort_generation";
}, {
    type: "abort_generation";
}>, z.ZodObject<{
    type: z.ZodLiteral<"create_project">;
    description: z.ZodString;
    lmStudioUrl: z.ZodEffects<z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>>, string | undefined, unknown>;
}, "strip", z.ZodTypeAny, {
    type: "create_project";
    description: string;
    lmStudioUrl?: string | undefined;
}, {
    type: "create_project";
    description: string;
    lmStudioUrl?: unknown;
}>, z.ZodObject<{
    type: z.ZodLiteral<"iterate">;
    projectName: z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>, string, string>;
    userRequest: z.ZodString;
    chatHistory: z.ZodDefault<z.ZodArray<z.ZodObject<{
        role: z.ZodEnum<["user", "assistant"]>;
        content: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        content: string;
        role: "user" | "assistant";
    }, {
        content: string;
        role: "user" | "assistant";
    }>, "many">>;
    lmStudioUrl: z.ZodEffects<z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>>, string | undefined, unknown>;
}, "strip", z.ZodTypeAny, {
    type: "iterate";
    projectName: string;
    userRequest: string;
    chatHistory: {
        content: string;
        role: "user" | "assistant";
    }[];
    lmStudioUrl?: string | undefined;
}, {
    type: "iterate";
    projectName: string;
    userRequest: string;
    lmStudioUrl?: unknown;
    chatHistory?: {
        content: string;
        role: "user" | "assistant";
    }[] | undefined;
}>, z.ZodObject<{
    type: z.ZodLiteral<"start_preview">;
    projectName: z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>, string, string>;
    lmStudioUrl: z.ZodEffects<z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>>, string | undefined, unknown>;
}, "strip", z.ZodTypeAny, {
    type: "start_preview";
    projectName: string;
    lmStudioUrl?: string | undefined;
}, {
    type: "start_preview";
    projectName: string;
    lmStudioUrl?: unknown;
}>, z.ZodObject<{
    type: z.ZodLiteral<"revert_version">;
    projectName: z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>, string, string>;
    commitHash: z.ZodString;
    lmStudioUrl: z.ZodEffects<z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>>, string | undefined, unknown>;
}, "strip", z.ZodTypeAny, {
    type: "revert_version";
    projectName: string;
    commitHash: string;
    lmStudioUrl?: string | undefined;
}, {
    type: "revert_version";
    projectName: string;
    commitHash: string;
    lmStudioUrl?: unknown;
}>]>;
export type WsMessage = z.infer<typeof WsMessageSchema>;
//# sourceMappingURL=runtime-input.schema.d.ts.map