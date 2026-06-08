// Strips reasoning/thinking blocks from raw LLM text (Qwen, DeepSeek-R1, etc.).
// Only anchored open+close pairs — never strip from start-of-string to a lone close tag.
const THINKING_PATTERNS = [
  /<think>[\s\S]*?<\/think>/gi,
  /<think>[\s\S]*?<\/redacted_thinking>/gi,
  /<thinking>[\s\S]*?<\/thinking>/gi,
];

const THINKING_OPEN = /<(?:think|redacted_thinking|thinking)>/i;

const MARKDOWN_FENCE = /^```(?:\w+)?\s*\n?([\s\S]*?)```$/;

const extractAfterUnclosedThinking = (text: string): string => {
  const closeMarkers = [/<\/think>/gi, /<\/redacted_thinking>/gi, /<\/thinking>/gi];

  for (const marker of closeMarkers) {
    const parts = text.split(marker);
    if (parts.length > 1) {
      const tail = parts.at(-1)?.trim() ?? "";
      if (tail) {
        return tail;
      }
    }
  }

  return text.replace(/<(?:think|redacted_thinking|thinking)[\s\S]*/gi, "").trim();
};

/**
 * Remove thinking/reasoning wrappers and markdown fences from model output.
 *
 * `preferJson` (set by the JSON callers — planner plan + editor analyze) makes the
 * UNCLOSED-think recovery keep everything from the first `{`/`[` instead of the lossy
 * "drop the first paragraph" heuristic. That heuristic emptied the result when JSON
 * followed reasoning with a single newline, and dropped the leading brace when the JSON
 * itself contained a blank line. Non-JSON callers (e.g. prompt enhance) keep the old
 * behavior.
 */
export const stripThinkingFromText = (
  raw: string,
  opts: { preferJson?: boolean } = {},
): string => {
  let text = raw.trim();
  if (!text) {
    return "";
  }

  for (const pattern of THINKING_PATTERNS) {
    text = text.replace(pattern, "").trim();
  }

  if (THINKING_OPEN.test(text)) {
    const openMatch = text.match(THINKING_OPEN);
    const openIdx = openMatch?.index ?? -1;
    if (openIdx >= 0) {
      const afterTag = text.slice(openIdx + (openMatch?.[0].length ?? 0));
      const jsonStart = opts.preferJson ? afterTag.search(/[{[]/) : -1;
      if (jsonStart >= 0) {
        // The answer is the JSON payload; the reasoning sits before the first {/[.
        text = afterTag.slice(jsonStart).trim();
      } else {
        const paragraphs = afterTag.split(/\n\n+/);
        const tail =
          paragraphs.length > 1 ? paragraphs.slice(1).join("\n\n").trim() : "";
        text = tail || extractAfterUnclosedThinking(text);
      }
    } else {
      text = extractAfterUnclosedThinking(text);
    }
  }

  const fenced = text.match(MARKDOWN_FENCE);
  if (fenced) {
    text = fenced[1].trim();
  }

  return text.trim();
};
