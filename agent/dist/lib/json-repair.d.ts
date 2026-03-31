/**
 * Extracts and repairs JSON from LLM output that may contain:
 * - Markdown code fences (```json ... ```)
 * - Trailing commas in arrays/objects
 * - Text before/after the JSON block
 * - Single-line comments (// ...)
 */
export declare const repairJson: (raw: string) => string;
export declare const safeJsonParse: (raw: string) => unknown | null;
//# sourceMappingURL=json-repair.d.ts.map