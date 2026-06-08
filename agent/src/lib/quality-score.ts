// Multi-axis DETERMINISTIC quality score for a generated project (Phase 1 of the
// highest-level harness). This is the free, always-on "ruler": it composes signals the
// pipeline already computes (typecheck error count, contract violations, web-export) with
// cheap content heuristics (empty/loading/error states, @/ui idiom, completeness) into a
// 0..100 score + per-axis breakdown. It is PURE + DI (takes a readFile + pre-computed
// deterministic signals), so it is trivially unit-testable and cannot touch generation.
//
// Used by: (a) the observe-only eval hook (mass-test quality trend), (b) the best-of-N
// verifier reranker (Phase 2), (c) the quality field exemplars are ranked by (Phase 3).

export interface QualityAxes {
  /** 0 type errors → 100; decays with error count. */
  typecheck: number;
  /** 0 contract/import violations → 100; decays with violation count. */
  contracts: number;
  /** Fraction of data screens that show empty/loading state → 100. */
  states: number;
  /** Idiomatic imports: UI from "@/ui", no react-native View/Text/StyleSheet. */
  idiomatic: number;
  /** Files are non-trivial, export something, end with // EOF, no placeholders. */
  completeness: number;
}

export interface QualityScore {
  /** Weighted 0..100. */
  score: number;
  axes: QualityAxes;
}

export interface QualityScoreInput {
  /** Plan file paths (relative to project), e.g. "app/(tabs)/index.tsx". */
  files: string[];
  /** Read a project file's content (DI). */
  readFile: (relativePath: string) => string | null;
  /** Total `tsc` error count (e.g. from countTypeErrors); 0 = clean. */
  typeErrorCount: number;
  /** Contract/import-shape violation count across files; 0 = clean. */
  contractViolationCount: number;
  /** Did the web export bundle succeed? (a hard gate the project already passed). */
  webExportOk: boolean;
}

const AXIS_WEIGHTS: Record<keyof QualityAxes, number> = {
  typecheck: 0.35,
  contracts: 0.20,
  states: 0.15,
  idiomatic: 0.15,
  completeness: 0.15,
};

const clamp = (n: number): number => Math.max(0, Math.min(100, n));
const isScreen = (path: string): boolean => /(^|\/)app\//.test(path) && /\.(tsx|jsx)$/.test(path);
const isLayout = (path: string): boolean => /_layout\.(tsx|jsx)$/.test(path);

// A screen "shows state" if it renders any empty / loading / error affordance.
const STATE_PATTERNS =
  /ListEmptyComponent|empty|no\s+items|nothing\s+(yet|here)|Spinner|ActivityIndicator|isLoading|loading|RefreshControl|error|catch\s*\(/i;

const FORBIDDEN_RN_IMPORT =
  /import\s*\{[^}]*\b(?:View|Text|StyleSheet)\b[^}]*\}\s*from\s*["']react-native["']/;
const USES_UI_KIT = /from\s*["']@\/ui["']/;

const EMPTY_PLACEHOLDER = "// EMPTY";

/**
 * Compute the deterministic quality score. Monotonic by construction: more type errors
 * or violations strictly lower the score; missing empty-states / non-idiomatic imports
 * lower their axis. Never throws (defensive on file reads).
 */
export const scoreProjectQuality = (input: QualityScoreInput): QualityScore => {
  const { files, readFile, typeErrorCount, contractViolationCount, webExportOk } = input;

  const typecheck = clamp(typeErrorCount <= 0 ? 100 : 100 - typeErrorCount * 15);
  const contracts = clamp(contractViolationCount <= 0 ? 100 : 100 - contractViolationCount * 20);

  const codeFiles = files.filter((f) => !isLayout(f) && /\.(ts|tsx|js|jsx)$/.test(f));
  const screens = codeFiles.filter(isScreen);

  let screensWithState = 0;
  let idiomaticOk = 0;
  let idiomaticTotal = 0;
  let completeFiles = 0;

  for (const f of codeFiles) {
    const content = (() => {
      try {
        return readFile(f);
      } catch {
        return null;
      }
    })();
    if (!content) continue;

    if (isScreen(f) && STATE_PATTERNS.test(content)) screensWithState++;

    // Idiomatic: count any file that touches UI; OK unless it imports RN View/Text/StyleSheet.
    if (USES_UI_KIT.test(content) || FORBIDDEN_RN_IMPORT.test(content)) {
      idiomaticTotal++;
      if (!FORBIDDEN_RN_IMPORT.test(content)) idiomaticOk++;
    }

    const hasExport = /\bexport\b/.test(content);
    const hasEof = content.includes("// EOF");
    const notPlaceholder = !content.includes(EMPTY_PLACEHOLDER);
    const nonTrivial = content.trim().length > 40;
    if (hasExport && notPlaceholder && nonTrivial && (hasEof || content.trim().length > 120)) {
      completeFiles++;
    }
  }

  const states = screens.length === 0 ? 100 : clamp((screensWithState / screens.length) * 100);
  const idiomatic = idiomaticTotal === 0 ? 100 : clamp((idiomaticOk / idiomaticTotal) * 100);
  const completeness = codeFiles.length === 0 ? 0 : clamp((completeFiles / codeFiles.length) * 100);

  const axes: QualityAxes = { typecheck, contracts, states, idiomatic, completeness };

  let score =
    axes.typecheck * AXIS_WEIGHTS.typecheck +
    axes.contracts * AXIS_WEIGHTS.contracts +
    axes.states * AXIS_WEIGHTS.states +
    axes.idiomatic * AXIS_WEIGHTS.idiomatic +
    axes.completeness * AXIS_WEIGHTS.completeness;

  // A failed web export is a hard structural problem — cap the score so it can never look
  // "great" (the pipeline only scores after the gate, but keep the guard for reranking).
  if (!webExportOk) score = Math.min(score, 40);

  return { score: Math.round(clamp(score)), axes };
};

/**
 * Cheap, RELATIVE per-file content score (0..100) for the best-of-N reranker (Phase 2).
 * Reuses the same idiomatic/states/completeness heuristics as the project score, but on a
 * single candidate file BEFORE it is written — so candidate selection needs no tsc/build.
 * Higher = better; meant for ranking N candidates of the SAME file, not absolute grading.
 */
export const scoreCandidateFile = (path: string, content: string): number => {
  if (!content || content.trim().length < 20) return 0;
  if (content.includes(EMPTY_PLACEHOLDER)) return 0;

  let s = 50;
  // Idiomatic: penalize raw react-native View/Text/StyleSheet; reward the @/ui kit.
  if (FORBIDDEN_RN_IMPORT.test(content)) s -= 30;
  if (USES_UI_KIT.test(content)) s += 10;
  // Completeness / structural sanity.
  if (/\bexport\b/.test(content)) s += 15;
  else s -= 25;
  if (content.includes("// EOF")) s += 10;
  if (content.trim().length > 120) s += 5;
  // Data screens should show empty/loading/error state.
  if (isScreen(path)) {
    if (STATE_PATTERNS.test(content)) s += 15;
    else s -= 10;
  }
  return clamp(s);
};
