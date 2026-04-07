// Repairs lax LLM JSON and returns null instead of throwing when recovery still fails.
/**
 * Extracts and repairs JSON from LLM output that may contain:
 * - Markdown code fences (```json ... ```)
 * - Thinking blocks (<think>...</think>)
 * - Text before/after the JSON block from verbose local-model responses
 * - Trailing commas in arrays/objects
 * - Single-line comments (// ...)
 * - Russian/English preamble text
 */
export const repairJson = (raw) => {
    let text = raw.trim();
    // Strip <think>...</think> blocks from thinking-enabled local models
    text = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    // Strip markdown code fences
    const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    if (fenceMatch) {
        text = fenceMatch[1].trim();
    }
    // Extract JSON object/array if surrounded by text
    if (!text.startsWith("{") && !text.startsWith("[")) {
        // Find the first { and last } to extract the JSON block
        const firstBrace = text.indexOf("{");
        const lastBrace = text.lastIndexOf("}");
        const firstBracket = text.indexOf("[");
        const lastBracket = text.lastIndexOf("]");
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            // Check if array starts before object
            if (firstBracket >= 0 && firstBracket < firstBrace && lastBracket > lastBrace) {
                text = text.slice(firstBracket, lastBracket + 1);
            }
            else {
                text = text.slice(firstBrace, lastBrace + 1);
            }
        }
        else if (firstBracket >= 0 && lastBracket > firstBracket) {
            text = text.slice(firstBracket, lastBracket + 1);
        }
    }
    // Remove standalone comment lines (not inside strings)
    text = text.replace(/^(\s*)\/\/(?!.*["']).*$/gm, "$1");
    // Fix trailing commas: ,] or ,}
    text = text.replace(/,\s*([\]}])/g, "$1");
    // Fix missing commas between properties (newline between "value"\n"key")
    text = text.replace(/("(?:[^"\\]|\\.)*")\s*\n\s*(")/g, "$1,\n  $2");
    return text;
};
export const safeJsonParse = (raw) => {
    // Try 1: direct parse
    try {
        return JSON.parse(raw.trim());
    }
    catch { /* continue */ }
    // Try 2: repair and parse
    try {
        return JSON.parse(repairJson(raw));
    }
    catch { /* continue */ }
    // Try 3: extract JSON from anywhere in the text (last resort)
    try {
        const braceStart = raw.indexOf("{");
        const braceEnd = raw.lastIndexOf("}");
        if (braceStart >= 0 && braceEnd > braceStart) {
            const candidate = raw.slice(braceStart, braceEnd + 1);
            return JSON.parse(repairJson(candidate));
        }
    }
    catch { /* give up */ }
    return null;
};
//# sourceMappingURL=json-repair.js.map