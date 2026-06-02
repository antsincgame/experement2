// stripThinkingFromText — thinking-model output cleanup for enhance and parsers.
import { describe, expect, it } from "vitest";
import { stripThinkingFromText } from "./strip-thinking.js";

const ot = "\u003c";
const ct = "\u003e";
const thinkOpen = `${ot}think${ct}`;
const thinkClose = `${ot}/think${ct}`;
const redactedOpen = `${ot}redacted_thinking${ct}`;
const redactedClose = `${ot}/redacted_thinking${ct}`;

describe("stripThinkingFromText", () => {
  it("removes closed think blocks (Qwen3)", () => {
    const raw = `${thinkOpen}planning${thinkClose}\nBuild a notes app with Tamagui tabs.`;
    expect(stripThinkingFromText(raw)).toBe("Build a notes app with Tamagui tabs.");
  });

  it("removes redacted_thinking blocks", () => {
    const raw = `${redactedOpen}internal notes${redactedClose}\n\nPremium expense tracker with charts.`;
    expect(stripThinkingFromText(raw)).toBe(
      "Premium expense tracker with charts."
    );
  });

  it("keeps text after unclosed think block", () => {
    const raw = `${thinkOpen}still reasoning\n\nFinal enhanced prompt here.`;
    expect(stripThinkingFromText(raw)).toBe("Final enhanced prompt here.");
  });

  it("unwraps markdown fences", () => {
    const raw = "```markdown\nA sleek Tamagui notes app.\n```";
    expect(stripThinkingFromText(raw)).toBe("A sleek Tamagui notes app.");
  });
});
