// Caps RAG + golden teaching blocks so per-file prompts stay within budget alongside deps.
import { MAX_TEACHING_CONTEXT_CHARS } from "./generation-contract.js";

const TRUNCATION_SUFFIX = "\n… [teaching context truncated for token budget]";

/** Keep leading sections (Tamagui core, top semantic hits) until the char budget is full. */
export const trimSectionsToBudget = (text: string, maxChars: number): string => {
  if (maxChars <= 0) {
    return "";
  }
  if (text.length <= maxChars) {
    return text;
  }

  const sections = text.split(/\n\n+/).filter((section) => section.trim().length > 0);
  if (sections.length === 0) {
    const hardLimit = Math.max(0, maxChars - TRUNCATION_SUFFIX.length);
    return `${text.slice(0, hardLimit)}${TRUNCATION_SUFFIX}`;
  }

  const kept: string[] = [];
  let size = 0;
  for (const section of sections) {
    const separator = kept.length > 0 ? "\n\n" : "";
    const nextSize = size + separator.length + section.length;
    if (nextSize > maxChars) {
      break;
    }
    kept.push(section);
    size = nextSize;
  }

  if (kept.length === 0) {
    const hardLimit = Math.max(0, maxChars - TRUNCATION_SUFFIX.length);
    return `${sections[0].slice(0, hardLimit)}${TRUNCATION_SUFFIX}`;
  }

  const joined = kept.join("\n\n");
  if (joined.length >= text.length) {
    return joined;
  }
  return `${joined}${TRUNCATION_SUFFIX}`;
};

/**
 * Merge keyword/semantic RAG with the golden exemplar block under one budget.
 * Golden exemplar is kept whole when possible; overflow is trimmed from RAG first.
 */
export const composeTeachingContext = (ragText: string, goldenBlock: string): string => {
  const rag = ragText.trim();
  const golden = goldenBlock.trim();
  if (!rag && !golden) {
    return "";
  }

  const max = MAX_TEACHING_CONTEXT_CHARS;
  const separator = "\n\n";
  const combinedLength =
    rag.length + golden.length + (rag && golden ? separator.length : 0);
  if (combinedLength <= max) {
    return [rag, golden].filter(Boolean).join(separator);
  }

  if (golden.length >= max) {
    return trimSectionsToBudget(golden, max);
  }

  const ragBudget = max - golden.length - (golden ? separator.length : 0);
  const trimmedRag = rag ? trimSectionsToBudget(rag, ragBudget) : "";
  return [trimmedRag, golden].filter(Boolean).join(separator);
};
