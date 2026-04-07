/**
 * Extracts and repairs JSON from LLM output that may contain:
 * - Markdown code fences (```json ... ```)
 * - Thinking blocks (<think>...</think>)
 * - Text before/after the JSON block from verbose local-model responses
 * - Trailing commas in arrays/objects
 * - Single-line comments (// ...)
 * - Russian/English preamble text
 */
export declare const repairJson: (raw: string) => string;
export declare const safeJsonParse: (raw: string) => unknown | null;
//# sourceMappingURL=json-repair.d.ts.map