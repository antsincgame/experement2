import { streamCompletion } from "../services/llm-proxy.js";
import { AppPlanSchema } from "../schemas/app-plan.schema.js";
import { SYSTEM_PLANNER } from "../prompts/system-planner.js";
export const planApp = async (options) => {
    const { description, temperature = 0.3, maxTokens = 32768, lmStudioUrl, onChunk } = options;
    const messages = [
        { role: "system", content: SYSTEM_PLANNER },
        { role: "user", content: `Create an app plan for: ${description}` },
    ];
    let fullJson = "";
    const generator = await streamCompletion(messages, {
        temperature,
        maxTokens,
        lmStudioUrl,
    });
    for await (const chunk of generator) {
        fullJson += chunk;
        onChunk?.(chunk);
    }
    const trimmed = fullJson.trim();
    let parsed;
    try {
        parsed = JSON.parse(trimmed);
    }
    catch (err) {
        const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error(`Planner returned invalid JSON: ${trimmed.slice(0, 200)}`);
        }
        parsed = JSON.parse(jsonMatch[0]);
    }
    const result = AppPlanSchema.safeParse(parsed);
    if (!result.success) {
        const issues = result.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ");
        throw new Error(`Plan validation failed: ${issues}`);
    }
    return result.data;
};
//# sourceMappingURL=planner.js.map