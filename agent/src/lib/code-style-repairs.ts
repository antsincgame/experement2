// Deterministic repairs for common LLM syntax mistakes in generated Expo/Tamagui code.

const STYLE_OBJECT_PROPS = [
  "bg",
  "color",
  "borderColor",
  "br",
  "opacity",
  "size",
  "borderWidth",
  "scale",
] as const;

const stylePropPattern = new RegExp(
  `([,{\\s])(${STYLE_OBJECT_PROPS.join("|")})(\\s*)=(\\s*)("?\\$[^",}\\s]+"?)`,
  "g",
);

const fixStyleObjectInner = (inner: string): string =>
  inner.replace(
    stylePropPattern,
    (_match, lead: string, prop: string, _sp1: string, _sp2: string, value: string) =>
      `${lead}${prop}: ${value}`,
  );

/** Fix `pressStyle={{ scale: 0.95, bg="$x" }}` — `=` is invalid inside JS object literals. */
export const repairStyleObjectLiteralShorthand = (code: string): string =>
  code.replace(/\{\{([^}]+)\}\}/g, (_, inner: string) => `{{${fixStyleObjectInner(inner)}}}`);

/** Tamagui Separator uses `vertical`, not `orientation="vertical"`. */
export const repairSeparatorOrientationProp = (code: string): string =>
  code
    .replace(/<Separator\s+orientation="vertical"/g, "<Separator vertical")
    .replace(/<Separator\s+orientation='vertical'/g, "<Separator vertical");

/**
 * Strip TypeScript suppression directives (`@ts-expect-error` / `@ts-ignore`) from
 * generated code. Shipped app code must never hide type errors: a directive over a
 * REAL error simply re-exposes it to the compiler-in-the-loop type-fix (intended),
 * and a directive that becomes UNUSED after a sibling file is fixed itself fails
 * `tsc` with TS2578 — which is a HARD gate that kills the preview. Removes whole-line
 * directive comments and trailing inline ones (keeping the code before the comment).
 */
export const stripSuppressionDirectives = (code: string): string =>
  code
    .split(/\r?\n/)
    .map((line): string | null => {
      // Whole-line directive comment (`// @ts-ignore …` or `/* @ts-expect-error */`) → drop the line.
      if (/^\s*(?:\/\/|\/\*)\s*@ts-(?:expect-error|ignore)\b/.test(line)) {
        return null;
      }
      // Trailing inline directive (`code(); // @ts-ignore`) → strip the comment, keep the code.
      return line.replace(/\s*\/\/\s*@ts-(?:expect-error|ignore)\b.*$/, "");
    })
    .filter((line): line is string => line !== null)
    .join("\n");

export const applyDeterministicCodeRepairs = (code: string): string =>
  repairSeparatorOrientationProp(repairStyleObjectLiteralShorthand(code));
