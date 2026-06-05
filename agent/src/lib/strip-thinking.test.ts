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

  it("preserves JSON before a closed redacted_thinking block", () => {
    const json = '{"name":"demo-app","files":[]}';
    const raw = `${json}${redactedOpen}plan notes${redactedClose}`;
    expect(stripThinkingFromText(raw)).toBe(json);
  });

  it("unwraps markdown fences", () => {
    const raw = "```markdown\nA sleek Tamagui notes app.\n```";
    expect(stripThinkingFromText(raw)).toBe("A sleek Tamagui notes app.");
  });

  it("recovers JSON after an UNCLOSED think when it follows reasoning with a single newline (preferJson)", () => {
    const raw = `${thinkOpen}reasoning about the plan\n{"name":"demo","files":[]}`;
    // Without preferJson the old paragraph heuristic emptied this; with it we recover the plan.
    expect(stripThinkingFromText(raw, { preferJson: true })).toBe(
      '{"name":"demo","files":[]}'
    );
  });

  it("keeps the leading brace of pretty-printed JSON after an unclosed think (preferJson)", () => {
    const raw = `${thinkOpen}brief reason\n{\n  "name": "demo",\n\n  "files": []\n}`;
    const out = stripThinkingFromText(raw, { preferJson: true });
    expect(out.startsWith("{")).toBe(true);
    expect(out).toContain('"name"');
    expect(out).toContain('"files"');
  });

  it("leaves non-JSON unclosed-think handling unchanged without preferJson", () => {
    const raw = `${thinkOpen}still reasoning\n\nFinal enhanced prompt here.`;
    expect(stripThinkingFromText(raw)).toBe("Final enhanced prompt here.");
  });
});
