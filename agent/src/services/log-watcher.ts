import type { ChildProcess } from "child_process";

const METRO_ERROR_MAX_LENGTH = 500;

export type BuildStatus = "building" | "success" | "error" | "idle";

export interface ParsedError {
  type: string;
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
  /Unexpected token/,
  /Failed to compile/,
] as const;

const FILE_LINE_PATTERN = /(?:at\s+)?([^\s(]+\.(?:tsx?|jsx?|css|json)):(\d+)/;

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

    if (!isNoiseLine(l) && stackLines.length < 5) {
      stackLines.push(l.trim());
    }
  }

  const raw = `${errorType}\n  File: ${file}:${line}\n  ${stackLines.join("\n  ")}`;

  return {
    type: errorType,
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

  const handleStdout = (data: Buffer): void => {
    const text = data.toString();

    callback({ type: "build_log", message: text });

    if (text.includes("Bundled") && !text.includes("error")) {
      if (successTimeout) clearTimeout(successTimeout);
      successTimeout = setTimeout(() => {
        callback({ type: "build_success" });
      }, 2000);
    }
  };

  const handleStderr = (data: Buffer): void => {
    const text = data.toString();
    errorBuffer += text;

    if (isErrorLine(text)) {
      if (successTimeout) {
        clearTimeout(successTimeout);
        successTimeout = null;
      }

      const parsed = parseMetroError(errorBuffer);
      if (parsed) {
        callback({ type: "build_error", error: parsed.raw });
        errorBuffer = "";
      }
    }

    callback({ type: "build_log", message: text });
  };

  childProcess.stdout?.on("data", handleStdout);
  childProcess.stderr?.on("data", handleStderr);

  return () => {
    childProcess.stdout?.off("data", handleStdout);
    childProcess.stderr?.off("data", handleStderr);
    if (successTimeout) clearTimeout(successTimeout);
  };
};
