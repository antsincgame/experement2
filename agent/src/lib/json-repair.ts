// Repairs lax LLM JSON and returns null instead of throwing when recovery still fails.
import { warnCaught } from "./catch-log.js";
/**
 * Extracts and repairs JSON from LLM output that may contain:
 * - Markdown code fences (```json ... ```)
 * - Thinking blocks (<think>...</think>)
 * - Text before/after the JSON block from verbose local-model responses
 * - Trailing commas in arrays/objects
 * - Single-line comments (// ...)
 * - Russian/English preamble text
 */
export const repairJson = (raw: string): string => {
  let text = raw.trim();

  // Strip reasoning blocks from thinking-enabled local models. Covers all
  // variants (<think>, <thinking>, <redacted_thinking>), then drops a dangling
  // unclosed block so the remaining text is parseable JSON.
  text = text.replace(/<(think|thinking|redacted_thinking)>[\s\S]*?<\/\1>/gi, "").trim();
  if (/<(?:think|thinking|redacted_thinking)>/i.test(text)) {
    text = text.replace(/<(?:think|thinking|redacted_thinking)>[\s\S]*$/i, "").trim();
  }

  // Prefer ```json fences; fall back to any fence that parses as JSON
  const jsonFenceMatches = [...text.matchAll(/```json\s*\n?([\s\S]*?)```/gi)];
  for (const match of jsonFenceMatches) {
    const candidate = match[1].trim();
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      /* try next fence */
    }
  }

  const fenceMatches = [...text.matchAll(/```(?:json)?\s*\n?([\s\S]*?)```/g)];
  for (const match of fenceMatches) {
    const candidate = match[1].trim();
    try {
      JSON.parse(candidate);
      text = candidate;
      break;
    } catch {
      /* try next fence */
    }
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
      } else {
        text = text.slice(firstBrace, lastBrace + 1);
      }
    } else if (firstBracket >= 0 && lastBracket > firstBracket) {
      text = text.slice(firstBracket, lastBracket + 1);
    }
  }

  // Remove standalone comment lines. Anchored to line start (after optional
  // whitespace), so JSON string values containing "//" (e.g. URLs) are untouched.
  text = text.replace(/^(\s*)\/\/.*$/gm, "$1");

  // Fix trailing commas: ,] or ,}
  text = text.replace(/,\s*([\]}])/g, "$1");

  // Fix missing commas between properties (newline between "value"\n"key")
  text = text.replace(/("(?:[^"\\]|\\.)*")\s*\n\s*(")/g, "$1,\n  $2");

  return text;
};

/**
 * Recovers JSON that a model cut off mid-stream (token budget) by balancing the
 * open brackets/strings of the partial object instead of giving up. A local
 * planner running with a large max_tokens routinely truncates before the closing
 * brace, which left `safeJsonParse` returning `null` and the planner throwing
 * "invalid JSON" on an otherwise mostly-complete plan.
 *
 * Walks from the first `{`/`[`, tracks string + bracket state, terminates an open
 * string, drops a dangling comma, then appends the missing closers. If a dangling
 * key/colon still makes it unparseable, it backtracks to the previous structural
 * boundary (comma or opening bracket) and retries, salvaging the largest valid
 * prefix. Returns `null` when there is nothing meaningful to recover.
 */
export const balanceTruncatedJson = (raw: string): string | null => {
  const firstBrace = raw.indexOf("{");
  const firstBracket = raw.indexOf("[");
  const starts = [firstBrace, firstBracket].filter((index) => index >= 0);
  if (starts.length === 0) {
    return null;
  }

  // Start at the first structural char; drop a dangling closing code fence.
  let body = raw.slice(Math.min(...starts)).replace(/\s*`{3,}\s*$/, "");

  for (let attempt = 0; attempt < 60 && body.length > 0; attempt++) {
    const stack: string[] = [];
    let inString = false;
    let escaped = false;

    for (let i = 0; i < body.length; i++) {
      const ch = body[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === "{") stack.push("}");
      else if (ch === "[") stack.push("]");
      else if (ch === "}" || ch === "]") stack.pop();
    }

    let candidate = inString ? `${body}"` : body;
    candidate = candidate.replace(/\s+$/, "").replace(/,$/, "");
    for (let i = stack.length - 1; i >= 0; i--) {
      candidate += stack[i];
    }

    try {
      JSON.parse(candidate);
      // Reject trivial recoveries that discarded all content (e.g. "{" -> "{}").
      if (candidate.replace(/[\s{}\[\],]/g, "").length === 0) {
        return null;
      }
      return candidate;
    } catch {
      const lastComma = body.lastIndexOf(",");
      const lastObject = body.lastIndexOf("{");
      const lastArray = body.lastIndexOf("[");
      const boundary = Math.max(lastComma, lastObject, lastArray);
      if (boundary <= 0) {
        return null;
      }
      // Drop a trailing comma + its partial element; keep an opening bracket so it
      // can be closed empty on the next pass.
      body = boundary === lastComma ? body.slice(0, boundary) : body.slice(0, boundary + 1);
    }
  }

  return null;
};

export const safeJsonParse = (raw: string): unknown | null => {
  // Try 1: direct parse
  try {
    return JSON.parse(raw.trim());
  } catch { /* continue */ }

  // Try 2: repair and parse
  try {
    return JSON.parse(repairJson(raw));
  } catch { /* continue */ }

  // Try 3: extract JSON from anywhere in the text (last resort)
  try {
    const braceStart = raw.indexOf("{");
    const braceEnd = raw.lastIndexOf("}");
    if (braceStart >= 0 && braceEnd > braceStart) {
      const candidate = raw.slice(braceStart, braceEnd + 1);
      return JSON.parse(repairJson(candidate));
    }
  } catch { /* continue */ }

  // Try 4: salvage JSON truncated mid-stream by balancing open brackets/strings.
  try {
    const balanced = balanceTruncatedJson(raw);
    if (balanced !== null) {
      return JSON.parse(balanced);
    }
  } catch { /* give up */ }

  const preview = raw.length > 200 ? `${raw.slice(0, 200)}…` : raw;
  warnCaught("json-repair", "all parse attempts failed", `safeJsonParse returning null: ${preview}`);
  return null;
};
