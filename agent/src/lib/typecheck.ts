// Turns raw `tsc --noEmit` output into structured diagnostics so the generation
// pipeline can feed precise, per-file type errors back to the model and iterate
// until the project compiles — a compiler-in-the-loop instead of one-shot guesses.
import { isProjectFilePath } from "./generation-contract.js";

export interface TypeDiagnostic {
  filePath: string;
  line: number;
  column: number;
  code: string; // e.g. "TS2322"
  message: string;
}

// Matches lines like: app/(tabs)/index.tsx(12,22): error TS2322: <message>
// The lazy path group + the (\d+,\d+) requirement correctly skips "(tabs)" in paths.
const TS_ERROR_LINE = /^(.+?)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.*)$/;
const MAX_MESSAGE_LEN = 600;

/** Parse `tsc` stdout/stderr into structured diagnostics, folding multi-line messages. */
export const parseTypeErrors = (output: string): TypeDiagnostic[] => {
  const diagnostics: TypeDiagnostic[] = [];
  let current: TypeDiagnostic | null = null;

  for (const rawLine of output.split(/\r?\n/)) {
    const match = rawLine.match(TS_ERROR_LINE);
    if (match) {
      current = {
        filePath: match[1].trim().replace(/\\/g, "/"),
        line: Number(match[2]),
        column: Number(match[3]),
        code: match[4],
        message: match[5].trim(),
      };
      diagnostics.push(current);
      continue;
    }

    // Indented, non-empty lines are continuations of the previous message
    // (e.g. overload details). Anything else ends the current diagnostic.
    if (current && /^\s+\S/.test(rawLine)) {
      if (current.message.length < MAX_MESSAGE_LEN) {
        current.message = `${current.message} ${rawLine.trim()}`.slice(0, MAX_MESSAGE_LEN);
      }
    } else {
      current = null;
    }
  }

  return diagnostics;
};

/** Group diagnostics by their file path, preserving first-seen order. */
export const groupDiagnosticsByFile = (
  diagnostics: TypeDiagnostic[]
): Map<string, TypeDiagnostic[]> => {
  const byFile = new Map<string, TypeDiagnostic[]>();
  for (const diagnostic of diagnostics) {
    const existing = byFile.get(diagnostic.filePath);
    if (existing) {
      existing.push(diagnostic);
    } else {
      byFile.set(diagnostic.filePath, [diagnostic]);
    }
  }
  return byFile;
};

/**
 * A generated file is safe to auto-fix only if it lives under app/ or src/ and is
 * not part of the scaffold we control (the UI kit) or the auto-generated layouts.
 */
export const isFixableProjectFile = (filePath: string): boolean => {
  const normalized = filePath.replace(/\\/g, "/");
  if (!isProjectFilePath(normalized)) return false;
  if (!/\.(ts|tsx)$/.test(normalized)) return false;
  if (normalized.startsWith("src/ui/")) return false;
  return true;
};

/** Short, actionable guidance per TypeScript error code for the fixer prompt. */
export const hintForCode = (code: string): string => {
  switch (code) {
    case "TS2322":
      return "A value's type does not match what is expected. Change the value (or the prop/state type) so they agree; for a component prop, match that component's Props interface exactly.";
    case "TS2304":
    case "TS2552":
      return "A name is used but never declared or imported. Add the missing import (for custom types: `import type { X } from \"@/types/index\"`) or define it before use.";
    case "TS2305":
    case "TS2614":
    case "TS2724":
      return "The module does not export that member. Fix the imported name, or switch between default and named import to match how it is actually exported.";
    case "TS2339":
      return "That property does not exist on the type. Use only properties declared on the interface, or correct the property name.";
    case "TS2345":
      return "An argument's type is wrong. Pass a value that matches the parameter type.";
    case "TS2554":
      return "Wrong number of arguments. Match the function's exact parameter count.";
    case "TS2739":
    case "TS2740":
    case "TS2741":
      return "Required properties are missing. Provide every required field of the target type/props.";
    case "TS2353":
      return "An object literal has a property the type does not allow. Remove it or use a valid property.";
    case "TS2367":
      return "This comparison is between non-overlapping types. Compare compatible values.";
    case "TS7006":
    case "TS7031":
      return "A parameter implicitly has type 'any'. Add an explicit type annotation.";
    case "TS7016":
      return "No type declarations exist for that module. Avoid the library or use a typed alternative.";
    case "TS18047":
    case "TS18048":
      return "The value may be null/undefined. Add a guard (e.g. optional chaining or an early return) before using it.";
    default:
      return "Read the error message carefully and adjust the code so the types are consistent.";
  }
};

/** Render a file's diagnostics as a compact, hint-annotated block for the LLM. */
export const formatDiagnosticsForPrompt = (diagnostics: TypeDiagnostic[]): string => {
  const lines = diagnostics.map(
    (d) => `- line ${d.line}:${d.column} [${d.code}] ${d.message}`
  );
  const uniqueCodes = [...new Set(diagnostics.map((d) => d.code))];
  const hints = uniqueCodes.map((code) => `- ${code}: ${hintForCode(code)}`);
  return `Errors:\n${lines.join("\n")}\n\nHow to fix:\n${hints.join("\n")}`;
};
