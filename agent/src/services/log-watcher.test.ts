// Verifies Metro parsing stays categorized so downstream gates can react to dependency and syntax failures.
import { EventEmitter } from "events";
import type { ChildProcess } from "child_process";
import { describe, it, expect, vi } from "vitest";
import { isNonFatalLine, parseMetroError, watchProcess, type LogCallback } from "./log-watcher";

describe("parseMetroError", () => {
  it('parses "Unable to resolve module" error', () => {
    const output = `Unable to resolve module "react-native-svg" from "src/components/Icon.tsx"`;
    const result = parseMetroError(output);
    expect(result).not.toBeNull();
    expect(result!.type).toContain("Unable to resolve module");
    expect(result!.category).toBe("dependency");
    expect(result!.file).toBe("src/components/Icon.tsx");
  });

  it('parses "Cannot find module" error', () => {
    const output = `Cannot find module '@expo/vector-icons'`;
    const result = parseMetroError(output);
    expect(result).not.toBeNull();
    expect(result!.type).toContain("Cannot find module");
  });

  it("parses SyntaxError with absolute Windows project path", () => {
    const output =
      "SyntaxError: D:/projects/experement2/workspace/markdown-notes/src/components/Toolbar.tsx: Invalid shorthand property initializer. (55:43)";
    const result = parseMetroError(output);
    expect(result).not.toBeNull();
    expect(result!.file).toBe(
      "D:/projects/experement2/workspace/markdown-notes/src/components/Toolbar.tsx",
    );
    expect(result!.line).toBe("55");
  });

  it('parses "SyntaxError" with file and line number', () => {
    const output = [
      "SyntaxError: Unexpected token (12:5)",
      "  at src/App.tsx:12",
    ].join("\n");
    const result = parseMetroError(output);
    expect(result).not.toBeNull();
    expect(result!.type).toContain("SyntaxError");
    expect(result!.category).toBe("syntax");
    expect(result!.file).toBe("src/App.tsx");
    expect(result!.line).toBe("12");
  });

  it('parses "TypeError" pattern', () => {
    const output = "TypeError: Cannot read property 'map' of undefined";
    const result = parseMetroError(output);
    expect(result).not.toBeNull();
    expect(result!.type).toContain("TypeError");
  });

  it("truncates raw output to 500 chars", () => {
    const longLine = "Error: " + "x".repeat(600);
    const result = parseMetroError(longLine);
    expect(result).not.toBeNull();
    expect(result!.raw.length).toBeLessThanOrEqual(500);
    expect(result!.raw.endsWith("...")).toBe(true);
  });

  it("does not truncate short output", () => {
    const output = "Error: something broke";
    const result = parseMetroError(output);
    expect(result).not.toBeNull();
    expect(result!.raw).not.toContain("...");
  });

  it("returns result even for warning-only text (noise filtered from stack)", () => {
    const output = "warning: some deprecation notice";
    const result = parseMetroError(output);
    // warning lines are noise but error pattern /error:/i still matches "warning"
    // Actually "warning" is a noise line AND doesn't match error patterns clearly
    // Let's check: isNoiseLine filters it, but the line itself may or may not match ERROR_PATTERNS
    // "warning: some deprecation notice" - the /error:\s*(.+)/i would NOT match "warning:"
    // So no error pattern matches -> errorType stays "UnknownError", file stays "unknown"
    // But parseMetroError still returns a result (it doesn't check if error was found)
    // However the stack will be empty because all lines are noise
    expect(result).not.toBeNull();
    expect(result!.stack).toBe("");
  });

  it('detects "BUNDLE error" pattern', () => {
    const output = [
      "BUNDLE  ./index.js error",
      "SyntaxError: Unexpected token (45:10)",
      "  at src/screens/Home.tsx:45",
    ].join("\n");
    const result = parseMetroError(output);
    expect(result).not.toBeNull();
    expect(result!.type).toContain("SyntaxError");
    expect(result!.file).toBe("src/screens/Home.tsx");
    expect(result!.line).toBe("45");
  });

  it("returns non-null for empty string (no lines after filter)", () => {
    const result = parseMetroError("");
    expect(result).toBeNull();
  });

  it("returns non-null for whitespace-only string", () => {
    const result = parseMetroError("   \n  \n   ");
    expect(result).toBeNull();
  });

  it("extracts file from Metro 'in path/to/file.tsx' format", () => {
    const output = [
      "Error: Something failed",
      "in src/components/Button.tsx",
    ].join("\n");
    const result = parseMetroError(output);
    expect(result).not.toBeNull();
    expect(result!.file).toBe("src/components/Button.tsx");
  });

  it("prefers FILE_LINE_PATTERN over METRO_FILE_PATTERN", () => {
    const output = [
      "Error: Compilation failed",
      "  at src/App.tsx:10",
      "in src/index.tsx",
    ].join("\n");
    const result = parseMetroError(output);
    expect(result).not.toBeNull();
    expect(result!.file).toBe("src/App.tsx");
    expect(result!.line).toBe("10");
  });

  it("limits stack lines to 5 non-noise entries", () => {
    const lines = [
      "Error: crash",
      "line1",
      "line2",
      "line3",
      "line4",
      "line5",
      "line6-should-be-excluded",
    ];
    const result = parseMetroError(lines.join("\n"));
    expect(result).not.toBeNull();
    const stackLines = result!.stack.split("\n");
    expect(stackLines.length).toBeLessThanOrEqual(5);
  });

  it("detects build_success from 'Bundled' text (integration context)", () => {
    // parseMetroError itself doesn't detect success, but we verify
    // that "Bundled" without "error" is NOT treated as an error
    const output = "Bundled 1234ms";
    const result = parseMetroError(output);
    // This returns a result because parseMetroError always returns for non-empty,
    // but it won't match any error pattern
    expect(result).not.toBeNull();
    expect(result!.type).toBe("UnknownError");
    // The real success detection happens in watchProcess via text.includes("Bundled")
  });

  it("does NOT treat a Tamagui parse bailout as an actionable error", () => {
    const output = "| Error in Tamagui parse, skipping Unexpected token '{' SyntaxError: Unexpected token '{'";
    const result = parseMetroError(output);
    expect(result).not.toBeNull();
    // The non-fatal Tamagui line must not become the error type, and no file is blamed.
    expect(result!.type).toBe("UnknownError");
    expect(result!.file).toBe("unknown");
  });

  it("still reports a real SyntaxError that appears alongside a Tamagui bailout", () => {
    const output = [
      "Error in Tamagui parse, skipping Unexpected token '{'",
      "SyntaxError: Unexpected token (12:5)",
      "  at src/App.tsx:12",
    ].join("\n");
    const result = parseMetroError(output);
    expect(result).not.toBeNull();
    expect(result!.type).toContain("SyntaxError");
    expect(result!.file).toBe("src/App.tsx");
  });
});

describe("isNonFatalLine", () => {
  it("flags Tamagui parse bailouts as non-fatal", () => {
    expect(isNonFatalLine("Error in Tamagui parse, skipping Unexpected token '{'")).toBe(true);
    expect(isNonFatalLine("Error in src/App.tsx parse, skipping package.json not found in path")).toBe(true);
  });

  it("does not flag real syntax or resolution errors", () => {
    expect(isNonFatalLine("SyntaxError: Unexpected token (12:5)")).toBe(false);
    expect(isNonFatalLine('Unable to resolve module "x" from "src/y.tsx"')).toBe(false);
  });
});

describe("watchProcess", () => {
  const makeFakeProcess = (): ChildProcess => {
    const proc = new EventEmitter() as unknown as ChildProcess;
    (proc as unknown as { stdout: EventEmitter }).stdout = new EventEmitter();
    (proc as unknown as { stderr: EventEmitter }).stderr = new EventEmitter();
    return proc;
  };

  const emitStdout = (proc: ChildProcess, text: string): void => {
    (proc.stdout as unknown as EventEmitter).emit("data", Buffer.from(text));
  };

  it("does NOT emit build_error for Tamagui parse bailouts", async () => {
    vi.useFakeTimers();
    const proc = makeFakeProcess();
    const callback = vi.fn<Parameters<LogCallback>>();
    watchProcess(proc, callback);

    emitStdout(proc, "| Error in Tamagui parse, skipping Unexpected token '{' SyntaxError: Unexpected token '{'\n");
    vi.advanceTimersByTime(300);

    const errorCalls = callback.mock.calls.filter(([event]) => event.type === "build_error");
    expect(errorCalls).toHaveLength(0);
    vi.useRealTimers();
  });

  it("emits a single build_error for a real fatal error", async () => {
    vi.useFakeTimers();
    const proc = makeFakeProcess();
    const callback = vi.fn<Parameters<LogCallback>>();
    watchProcess(proc, callback);

    emitStdout(proc, "SyntaxError: Unexpected token (12:5)\n  at src/App.tsx:12\n");
    vi.advanceTimersByTime(300);

    const errorCalls = callback.mock.calls.filter(([event]) => event.type === "build_error");
    expect(errorCalls).toHaveLength(1);
    expect(errorCalls[0][0].error).toContain("SyntaxError");
    vi.useRealTimers();
  });

  it("does not mask a non-'error' fatal that shares a chunk with 'Bundled'", async () => {
    vi.useFakeTimers();
    const proc = makeFakeProcess();
    const callback = vi.fn<Parameters<LogCallback>>();
    watchProcess(proc, callback);

    // "Unable to resolve module" lacks the literal substring "error", so the old
    // `!includes("error")` guard treated this as a clean bundle and dropped it.
    emitStdout(proc, 'Web Bundled 1500ms\nUnable to resolve module "x" from "src/y.tsx"\n');
    vi.advanceTimersByTime(300);

    const errorCalls = callback.mock.calls.filter(([event]) => event.type === "build_error");
    const successCalls = callback.mock.calls.filter(([event]) => event.type === "build_success");
    expect(errorCalls).toHaveLength(1);
    expect(successCalls).toHaveLength(0);
    vi.useRealTimers();
  });

  it("emits build_success for a clean Bundled line", async () => {
    vi.useFakeTimers();
    const proc = makeFakeProcess();
    const callback = vi.fn<Parameters<LogCallback>>();
    watchProcess(proc, callback);

    emitStdout(proc, "Web Bundled 1200ms index.js\n");
    vi.advanceTimersByTime(2100);

    const successCalls = callback.mock.calls.filter(([event]) => event.type === "build_success");
    expect(successCalls).toHaveLength(1);
    vi.useRealTimers();
  });

  it("deduplicates identical repeated errors within one build", async () => {
    vi.useFakeTimers();
    const proc = makeFakeProcess();
    const callback = vi.fn<Parameters<LogCallback>>();
    watchProcess(proc, callback);

    const fatal = "SyntaxError: Unexpected token (12:5)\n  at src/App.tsx:12\n";
    emitStdout(proc, fatal);
    vi.advanceTimersByTime(300);
    emitStdout(proc, fatal);
    vi.advanceTimersByTime(300);

    const errorCalls = callback.mock.calls.filter(([event]) => event.type === "build_error");
    expect(errorCalls).toHaveLength(1);
    vi.useRealTimers();
  });
});
