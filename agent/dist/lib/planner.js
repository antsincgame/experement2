// Adds contract-aware plan validation so invalid or unrecoverable planner JSON fails before generation starts.
import { streamCompletion } from "../services/llm-proxy.js";
import { AppPlanSchema } from "../schemas/app-plan.schema.js";
import { SYSTEM_PLANNER } from "../prompts/system-planner.js";
import { validateAppPlan } from "./project-validator.js";
import { safeJsonParse } from "./json-repair.js";
export const planApp = async (options) => {
    const { description, temperature = 0.3, maxTokens = 65536, lmStudioUrl, model, onChunk } = options;
    const messages = [
        { role: "system", content: SYSTEM_PLANNER },
        { role: "user", content: `/no_think\nCreate an app plan for: ${description}\n\nRespond with ONLY a JSON object. No thinking, no explanation, no markdown.` },
    ];
    let fullJson = "";
    const generator = await streamCompletion(messages, {
        temperature,
        maxTokens,
        lmStudioUrl,
        model,
    });
    let planChunkBuffer = "";
    let planLastSend = Date.now();
    for await (const chunk of generator) {
        fullJson += chunk;
        planChunkBuffer += chunk;
        if (Date.now() - planLastSend > 100) {
            onChunk?.(planChunkBuffer);
            planChunkBuffer = "";
            planLastSend = Date.now();
        }
    }
    if (planChunkBuffer)
        onChunk?.(planChunkBuffer);
    // Strip Qwen3 thinking blocks: <think>...</think>
    let trimmed = fullJson.trim().replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    // Also strip unclosed thinking block (model started thinking but didn't close)
    if (trimmed.includes("<think>")) {
        trimmed = trimmed.replace(/<think>[\s\S]*/g, "").trim();
    }
    let parsed;
    try {
        parsed = safeJsonParse(trimmed);
        if (parsed === null) {
            throw new Error("Planner returned unrecoverable JSON");
        }
    }
    catch (err) {
        throw new Error(`Planner returned invalid JSON: ${err instanceof Error ? err.message : "parse error"}\n${trimmed.slice(0, 300)}`);
    }
    const result = AppPlanSchema.safeParse(parsed);
    if (!result.success) {
        const issues = result.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ");
        throw new Error(`Plan validation failed: ${issues}`);
    }
    const semanticIssues = validateAppPlan(result.data);
    if (semanticIssues.length > 0) {
        throw new Error(`Plan validation failed: ${semanticIssues
            .map((issue) => `${issue.filePath ?? "plan"}: ${issue.message}`)
            .join("; ")}`);
    }
    return result.data;
};
//# sourceMappingURL=planner.js.map