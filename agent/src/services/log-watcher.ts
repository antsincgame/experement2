// Classifies Metro output so autofix can react differently to dependency, syntax, and runtime failures.
import type { ChildProcess } from "child_process";

const METRO_ERROR_MAX_LENGTH = 500;

export type BuildStatus = "building" | "success" | "error" | "idle";
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
const METRO_FILE_PATTERN = /(?:in|from)\s+['"]?([^\s'"]+\.(?:tsx?|jsx?))['"]?/;
const UNABLE_RESOLVE_PATTERN = /Unable to resolve module\s+["']?([^"'\s]+)["']?.*from\s+["']?([^"'\s:]+)["']?/;

const isErrorLine = (line: string): boolean =>
  ERROR_PATTERNS.some((pattern) => pattern.test(line));

const isNoiseLine = (line: string): boolean => {
  const lower = line.toLowerCase();
  return (
    lower.includes("warning") ||
    lower.includes("deprecat") ||
    lower.includes("experimentalwarning") ||
    lower.includes("info") ||
    line.trim().startsWith("at node:") ||
    line.trim().startsWith("at Object.") ||
    line.includes("node_modules") ||
    line.trim() === ""
  );
};

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

    if (!isNoiseLine(l) && stackLines.length < 5) {
      stackLines.push(l.trim());
    }
  }

  const raw = `${errorType}\n  File: ${file}:${line}\n  ${stackLines.join("\n  ")}`;

  return {
    type: errorType,
    category: categorizeError(errorType),
    file,
    line,
    stack: stackLines.join("\n"),
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

  const checkForError = (text: string): void => {
    errorBuffer += text;

    // Check both current chunk AND accumulated buffer for error patterns
    if (isErrorLine(text) || isErrorLine(errorBuffer)) {
      if (successTimeout) {
        clearTimeout(successTimeout);
        successTimeout = null;
      }

      // Debounce: wait 500ms for more error chunks before parsing
      if (errorFlushTimeout) clearTimeout(errorFlushTimeout);
      errorFlushTimeout = setTimeout(() => {
        const parsed = parseMetroError(errorBuffer);
        if (parsed) {
          callback({ type: "build_error", error: parsed.raw });
        }
        errorBuffer = "";
        errorFlushTimeout = null;
      }, 500);
    }
  };

  const handleData = (data: Buffer): void => {
    const text = data.toString();

    callback({ type: "build_log", message: text });

    // Check for success (Metro "Bundled" message)
    if (text.includes("Bundled") && !text.toLowerCase().includes("error")) {
      if (successTimeout) clearTimeout(successTimeout);
      if (errorFlushTimeout) {
        clearTimeout(errorFlushTimeout);
        errorFlushTimeout = null;
      }
      errorBuffer = "";
      successTimeout = setTimeout(() => {
        callback({ type: "build_success" });
      }, 2000);
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
