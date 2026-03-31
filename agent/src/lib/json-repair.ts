/**
 * Extracts and repairs JSON from LLM output that may contain:
 * - Markdown code fences (```json ... ```)
 * - Trailing commas in arrays/objects
 * - Text before/after the JSON block
 * - Single-line comments (// ...)
 */
export const repairJson = (raw: string): string => {
  let text = raw.trim();

  // Strip markdown code fences
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  // Extract JSON object/array if surrounded by text
  if (!text.startsWith("{") && !text.startsWith("[")) {
    const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      text = jsonMatch[1];
    }
  }

  // Remove single-line comments (// ...) but not inside strings
  text = text.replace(/^(\s*)\/\/.*$/gm, "$1");

  // Fix trailing commas: ,] or ,}
  text = text.replace(/,\s*([\]}])/g, "$1");

  // Fix missing commas between properties (newline between "value"\n"key")
  text = text.replace(/("(?:[^"\\]|\\.)*")\s*\n\s*(")/g, "$1,\n  $2");

  return text;
};

export const safeJsonParse = (raw: string): unknown => {
  // Try direct parse first
  try {
    return JSON.parse(raw.trim());
  } catch {
    // Try with repair
    const repaired = repairJson(raw);
    return JSON.parse(repaired);
  }
};
