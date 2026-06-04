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

export const applyDeterministicCodeRepairs = (code: string): string =>
  repairSeparatorOrientationProp(repairStyleObjectLiteralShorthand(code));
