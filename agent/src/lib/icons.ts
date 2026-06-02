// Single source of truth for icon-name handling.
//
// Why this file exists: the project previously kept FIVE separate, hand-maintained
// icon allow/fallback lists (two in generator.ts, two in templates.ts, one prose
// list in knowledge-base.ts). They drifted apart and disagreed with the real
// @expo/vector-icons Feather glyph set (~290 names), which produced the dominant
// `TS2322: Type '"calculator"' is not assignable to ...` failure class.
//
// The real safety net is now the runtime <Icon> wrapper scaffolded into every
// generated project (see template-cache.ts): it types `name` as a plain string
// and resolves unknown names to a neutral glyph at runtime, so an invalid icon
// name can never cause a compile error again. This module only provides
// best-effort *prettification* (mapping common hallucinated aliases to a sensible
// Feather glyph) so tab bars show a meaningful icon instead of the fallback.

export const DEFAULT_ICON = "circle";

/**
 * Best-effort alias map: common names that LLMs invent → the closest real Feather
 * glyph. This is NOT correctness-critical — the runtime wrapper guarantees safety.
 * Merged and de-duplicated from the old generator.ts + templates.ts maps.
 */
export const ICON_ALIASES: Record<string, string> = {
  calculator: "hash",
  palette: "droplet",
  "heart-outline": "heart",
  "home-outline": "home",
  "settings-outline": "settings",
  "trash-outline": "trash-2",
  add: "plus",
  remove: "minus",
  close: "x",
  done: "check",
  money: "dollar-sign",
  wallet: "credit-card",
  "clock-outline": "clock",
  timer: "clock",
  stopwatch: "clock",
  fitness: "activity",
  dumbbell: "activity",
  weight: "activity",
  water: "droplet",
  food: "coffee",
  restaurant: "coffee",
  book: "book-open",
  document: "file-text",
  note: "file-text",
  chart: "bar-chart-2",
  graph: "trending-up",
  analytics: "bar-chart-2",
  notification: "bell",
  alarm: "bell",
  person: "user",
  people: "users",
  profile: "user",
  account: "user",
  category: "grid",
  "tag-outline": "tag",
  history: "clock",
  refresh: "refresh-cw",
  share: "share-2",
  favorite: "star",
  weather: "cloud",
  temp: "thermometer",
  temperature: "thermometer",
  pill: "thermometer",
  "chef-hat": "coffee",
  dice: "square",
  leaf: "wind",
  brain: "zap",
  pen: "edit",
};

/**
 * Resolve an icon name to a sensible Feather glyph for the auto-generated tab bar.
 * Unknown names are returned unchanged — the runtime <Icon> wrapper handles any
 * remaining invalid name without a type or runtime crash.
 */
export const resolveIconName = (raw?: string): string => {
  const name = (raw ?? "").trim();
  if (!name) return DEFAULT_ICON;
  return ICON_ALIASES[name] ?? name;
};
