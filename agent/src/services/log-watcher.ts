// Classifies Metro output with bounded error payloads so autofix gets concise, stable diagnostics.
import type { ChildProcess } from "child_process";

const METRO_ERROR_MAX_LENGTH = 500;
const MAX_STACK_LINES = 5;
// Wait briefly after a "Bundled" line before declaring success, so a trailing
// fatal error in a following chunk can still cancel it.
const SUCCESS_DEBOUNCE_MS = 2000;

export type BuildIssueCategory =
  | "dependency"
  | "syntax"
  | "runtime"
  | "bundle"
  | "unknown";

export interface ParsedError {
  type: string;
  category: BuildIssueCategory;
  file: string;
  line: string;
  stack: string;
  raw: string;
}

const ERROR_PATTERNS = [
  /SyntaxError:\s*(.+)/,
  /Error:\s*(.+)/,
  /Module not found:\s*(.+)/,
  /TypeError:\s*(.+)/,
  /Cannot find module\s*'(.+)'/,
  /Unable to resolve module\s*(.+)/,
  /Unexpected token/,
  /Failed to compile/,
  /error:\s*(.+)/i,
  /BUNDLE\s+.*error/i,
] as const;

const FILE_LINE_PATTERN = /(?:at\s+)?([^\s(]+\.(?:tsx?|jsx?|css|json)):(\d+)/;
/** Metro SyntaxError: `D:/proj/src/Foo.tsx: message (line:col)` */
const SYNTAX_ERROR_FILE_PATTERN =
  /SyntaxError:\s*(.+\.(?:tsx?|jsx?)):\s*.+\((\d+):(\d+)\)/i;
const METRO_FILE_PATTERN = /(?:in|from)\s+['"]?([^\s'"]+\.(?:tsx?|jsx?))['"]?/;
const UNABLE_RESOLVE_PATTERN = /Unable to resolve module\s+["']?([^"'\s]+)["']?.*from\s+["']?([^"'\s:]+)["']?/;

// Tamagui's static compiler logs "Error in <file> parse, skipping ..." (Warning 001
// in the Tamagui docs) when it cannot statically optimize a component and bails out
// to runtime. The bundle still succeeds, so these lines contain "Error"/"Unexpected
// token" but are NOT fatal. Treating them as build errors triggers futile autofix on
// a working app and floods the chat. Keep this list narrow: only known soft bailouts.
const NON_FATAL_PATTERNS = [
  /Error in .*parse, skipping/i,
  /Tamagui[^\n]*skipping/i,
  /skipping[^\n]*not found in path/i,
] as const;

/** True for Metro/Tamagui lines that look like errors but do not fail the bundle. */
export const isNonFatalLine = (line: string): boolean =>
  NON_FATAL_PATTERNS.some((pattern) => pattern.test(line));

const isErrorLine = (line: string): boolean =>
  !isNonFatalLine(line) && ERROR_PATTERNS.some((pattern) => pattern.test(line));

/** A multi-line chunk is fatal only if at least one of its lines is a fatal error. */
const hasFatalErrorLine = (text: string): boolean =>
  text.split("\n").some((line) => isErrorLine(line));

const isNoiseLine = (line: string): boolean => {
  const trimmed = line.trim();
  const lower = trimmed.toLowerCase();
  return (
    lower.includes("warning") ||
    lower.includes("deprecat") ||
    lower.includes("experimentalwarning") ||
    (lower.startsWith("info") && !lower.includes("error")) ||
    trimmed.startsWith("at node:") ||
    trimmed.startsWith("at Object.") ||
    trimmed.startsWith("at Module.") ||
    trimmed.startsWith("at require") ||
    trimmed.startsWith("at async") ||
    (line.includes("node_modules") && !line.includes("Unable to resolve")) ||
    trimmed === ""
  );
};

const isUserFileLine = (line: string): boolean =>
  /src\//.test(line) && !line.includes("node_modules");

const truncateError = (errorText: string): string => {
  if (errorText.length <= METRO_ERROR_MAX_LENGTH) return errorText;
  return errorText.slice(0, METRO_ERROR_MAX_LENGTH - 3) + "...";
};

const categorizeError = (errorType: string): BuildIssueCategory => {
  const normalized = errorType.toLowerCase();
  if (
    normalized.includes("unable to resolve module") ||
    normalized.includes("cannot find module") ||
    normalized.includes("module not found")
  ) {
    return "dependency";
  }

  if (normalized.includes("syntaxerror") || normalized.includes("unexpected token")) {
    return "syntax";
  }

  if (normalized.includes("typeerror")) {
    return "runtime";
  }

  if (normalized.includes("bundle") || normalized.includes("failed to compile")) {
    return "bundle";
  }

  return "unknown";
};

export const parseMetroError = (output: string): ParsedError | null => {
  const lines = output.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return null;

  let errorType = "UnknownError";
  let file = "unknown";
  let line = "0";
  const stackLines: string[] = [];

  for (const l of lines) {
    // Never let a non-fatal Tamagui bailout define the error type/file/stack.
    if (isNonFatalLine(l)) {
      continue;
    }

    const syntaxLine = l.replace(/\\/g, "/");
    const syntaxMatch = syntaxLine.match(SYNTAX_ERROR_FILE_PATTERN);
    if (syntaxMatch && file === "unknown") {
      errorType = l.trim();
      file = syntaxMatch[1];
      line = syntaxMatch[2];
    }

    for (const pattern of ERROR_PATTERNS) {
      const match = l.match(pattern);
      if (match) {
        errorType = l.trim();
        break;
      }
    }

    const fileMatch = l.match(FILE_LINE_PATTERN);
    if (fileMatch && file === "unknown") {
      file = fileMatch[1];
      line = fileMatch[2];
    }

    // Metro "Unable to resolve module X from Y" format
    const resolveMatch = l.match(UNABLE_RESOLVE_PATTERN);
    if (resolveMatch && file === "unknown") {
      file = resolveMatch[2]; // file that has the bad import
    }

    // Metro "in path/to/file.tsx" format
    const metroFileMatch = l.match(METRO_FILE_PATTERN);
    if (metroFileMatch && file === "unknown") {
      file = metroFileMatch[1];
    }

    if (!isNoiseLine(l)) {
      if (isUserFileLine(l)) {
        stackLines.unshift(l.trim()); // user files first
      } else if (stackLines.length < MAX_STACK_LINES) {
        stackLines.push(l.trim());
      }
    }
  }

  // Deduplicate and limit
  const uniqueStack = [...new Set(stackLines)].slice(0, MAX_STACK_LINES);
  const raw = `${errorType}\n  File: ${file}:${line}\n  ${uniqueStack.join("\n  ")}`;

  return {
    type: errorType,
    category: categorizeError(errorType),
    file,
    line,
    stack: uniqueStack.join("\n"),
    raw: truncateError(raw),
  };
};

export type LogCallback = (event: {
  type: "build_log" | "build_error" | "build_success";
  message?: string;
  error?: string;
}) => void;

export const watchProcess = (
  childProcess: ChildProcess,
  callback: LogCallback
): (() => void) => {
  let errorBuffer = "";
  let successTimeout: NodeJS.Timeout | null = null;
  let errorFlushTimeout: NodeJS.Timeout | null = null;
  // Dedup identical errors within one build so a repeated Metro diagnostic does not
  // flood the chat ("ошибки кучами"). Reset on success so a new failure is reported.
  let lastErrorSignature = "";

  const checkForError = (text: string): void => {
    errorBuffer += text;

    // Only react to FATAL error lines; non-fatal Tamagui bailouts are ignored even
    // when they appear alongside benign output.
    if (hasFatalErrorLine(text) || hasFatalErrorLine(errorBuffer)) {
      if (successTimeout) {
        clearTimeout(successTimeout);
        successTimeout = null;
      }

      // Debounce: wait 200ms for more error chunks before parsing
      if (errorFlushTimeout) clearTimeout(errorFlushTimeout);
      errorFlushTimeout = setTimeout(() => {
        const parsed = parseMetroError(errorBuffer);
        if (parsed && parsed.raw !== lastErrorSignature) {
          lastErrorSignature = parsed.raw;
          callback({ type: "build_error", error: parsed.raw });
        }
        errorBuffer = "";
        errorFlushTimeout = null;
      }, 200);
    }
  };

  const handleData = (data: Buffer): void => {
    const text = data.toString();

    callback({ type: "build_log", message: text });

    // Treat as a successful bundle only when the chunk carries no FATAL error line.
    // The previous `!includes("error")` guard masked real failures whose text lacks
    // the literal substring "error" (e.g. "Unexpected token", "Unable to resolve
    // module", "Module not found") when they share a chunk with a "Bundled" line.
    if (
      text.includes("Bundled") &&
      !hasFatalErrorLine(text) &&
      !hasFatalErrorLine(errorBuffer + text)
    ) {
      if (successTimeout) clearTimeout(successTimeout);
      if (errorFlushTimeout) {
        clearTimeout(errorFlushTimeout);
        errorFlushTimeout = null;
      }
      errorBuffer = "";
      lastErrorSignature = "";
      successTimeout = setTimeout(() => {
        callback({ type: "build_success" });
      }, SUCCESS_DEBOUNCE_MS);
      return;
    }

    // Check for errors in BOTH stdout and stderr (Metro web writes errors to stdout)
    checkForError(text);
  };

  // Metro web writes BOTH logs and errors to stdout
  childProcess.stdout?.on("data", handleData);
  childProcess.stderr?.on("data", handleData);

  return () => {
    childProcess.stdout?.off("data", handleData);
    childProcess.stderr?.off("data", handleData);
    if (successTimeout) clearTimeout(successTimeout);
    if (errorFlushTimeout) clearTimeout(errorFlushTimeout);
  };
};
