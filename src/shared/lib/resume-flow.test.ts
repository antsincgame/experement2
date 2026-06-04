import { describe, expect, it } from "vitest";
import {
  isContinueGenerationMessage,
  resolveResumeProjectName,
} from "./resume-flow";

describe("resolveResumeProjectName", () => {
  it("prefers a real route slug over the creating placeholder", () => {
    expect(resolveResumeProjectName("matchmate", "__creating__")).toBe("matchmate");
  });

  it("falls back to store slug while URL is still __creating__", () => {
    expect(resolveResumeProjectName("__creating__", "matchmate")).toBe("matchmate");
  });

  it("returns null when only the creating placeholder is known", () => {
    expect(resolveResumeProjectName("__creating__", "__creating__")).toBeNull();
  });
});

describe("isContinueGenerationMessage", () => {
  it("matches Russian and English continue phrases", () => {
    expect(isContinueGenerationMessage("продолжай")).toBe(true);
    expect(isContinueGenerationMessage("Continue generation")).toBe(true);
    expect(isContinueGenerationMessage("fix the button color")).toBe(false);
  });
});
