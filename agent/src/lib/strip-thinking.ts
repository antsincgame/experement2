// Strips reasoning/thinking blocks from raw LLM text (Qwen, DeepSeek-R1, etc.).
const THINKING_PATTERNS = [
  /<think>[\s\S]*?<\/think>/gi,
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
 */
export const stripThinkingFromText = (raw: string): string => {
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
      const paragraphs = afterTag.split(/\n\n+/);
      const tail = paragraphs.length > 1 ? paragraphs.slice(1).join("\n\n").trim() : "";
      text = tail || extractAfterUnclosedThinking(text);
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
