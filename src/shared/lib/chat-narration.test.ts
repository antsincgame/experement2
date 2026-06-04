// Smoke tests for Bolt.new-style chat narration strings.
import { describe, expect, it } from "vitest";
import {
  formatFileWritingNarration,
  formatGenerationDoneNarration,
  formatPhaseBridge,
  formatPhaseChatNarration,
  formatPlanLockedNarration,
  formatPreviewReadyNarration,
  formatScaffoldReadyNarration,
} from "./chat-narration";

describe("formatPhaseChatNarration", () => {
  it("returns multi-line copy for planning with project context", () => {
    const text = formatPhaseChatNarration("planning", {
      displayName: "Notes",
    });
    expect(text).toContain("Sketching the blueprint");
    expect(text).toContain("**Notes**");
  });

  it("includes a bridge when transitioning from scaffolding to generating", () => {
    const text = formatPhaseChatNarration(
      "generating",
      { displayName: "Notes" },
      "scaffolding",
    );
    expect(text).toContain("Workshop is open");
    expect(text).toContain("---");
    expect(text).toContain("Writing code");
  });

  it("returns null for idle status", () => {
    expect(formatPhaseChatNarration("idle", {})).toBeNull();
  });
});

describe("formatPhaseBridge", () => {
  it("narrates planning to scaffolding handoff", () => {
    const text = formatPhaseBridge("planning", "scaffolding", { displayName: "App" });
    expect(text).toContain("Blueprint frozen");
    expect(text).toContain("**App**");
  });
});

describe("formatPlanLockedNarration", () => {
  it("mentions file count and display name", () => {
    const text = formatPlanLockedNarration("My App", 12);
    expect(text).toContain("Plan locked");
    expect(text).toContain("**My App**");
    expect(text).toContain("**12 files**");
  });
});

describe("formatScaffoldReadyNarration", () => {
  it("includes project slug", () => {
    expect(formatScaffoldReadyNarration("notes-app")).toContain("`notes-app`");
  });
});

describe("formatFileWritingNarration", () => {
  it("shows long opener when progress is low", () => {
    const text = formatFileWritingNarration("src/components/Card.tsx", 0.05, null);
    expect(text).toContain("Opening");
    expect(text).toContain("5%");
  });

  it("stays compact when progress is higher", () => {
    const text = formatFileWritingNarration("src/components/Card.tsx", 0.42, null);
    expect(text).not.toContain("Opening");
    expect(text).toContain("42%");
  });
});

describe("formatGenerationDoneNarration", () => {
  it("mentions files written and act two", () => {
    expect(formatGenerationDoneNarration(7)).toContain("**7 files**");
    expect(formatGenerationDoneNarration(7)).toContain("act two");
  });
});

describe("formatPreviewReadyNarration", () => {
  it("includes port and display name", () => {
    const text = formatPreviewReadyNarration(8081, "Notes");
    expect(text).toContain("8081");
    expect(text).toContain("**Notes**");
  });
});
