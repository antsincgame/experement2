// Builds and caches the embedded RAG index. Gathers the corpus (docs + persisted
// error fixes + summaries of past project files), embeds it via LM Studio, and
// caches the vectors on disk keyed by corpus hash + embedding model so we embed
// only when the corpus or model changes. Returns null whenever embeddings are
// unavailable, letting callers fall back to the keyword RAG.
import fs from "fs";
import path from "path";
import { embedTexts, type EmbedOptions } from "../services/embeddings.js";
import { resolveEmbeddingModel } from "../services/embedding-model.js";
import { extractExportContracts } from "./context-builder.js";
import { getWorkspaceRoot } from "../services/file-manager.js";
import { loadFixes } from "./error-fix-store.js";
import {
  assembleCorpus,
  corpusHash,
  type ExampleSummary,
} from "./rag-corpus.js";
import type { EmbeddedChunk, RagChunk } from "./vector-store.js";

const MAX_EXAMPLE_FILES = 40;
const SCAFFOLD_DIRS = ["src/ui/", "src/services/db.ts"];
const EXCLUDED_PROJECT_PREFIXES = ["vitest-", "e2e-", "template_cache"];

const defaultCacheDir = (): string => path.resolve(process.cwd(), ".rag");

interface CachedIndex {
  hash: string;
  model: string;
  chunks: EmbeddedChunk[];
}

const inferType = (relPath: string): string => {
  if (relPath.startsWith("app/")) return "screen";
  if (relPath.includes("/stores/")) return "store";
  if (relPath.includes("/hooks/")) return "hook";
  if (relPath.includes("/components/")) return "component";
  if (relPath.includes("/types/")) return "type";
  return "file";
};

const humanize = (relPath: string): string => {
  const base = relPath.split("/").pop() ?? relPath;
  return base.replace(/\.[^.]+$/, "");
};

const isIndexableExample = (relPath: string): boolean => {
  if (!/\.(ts|tsx)$/.test(relPath)) return false;
  if (!relPath.startsWith("src/") && !relPath.startsWith("app/")) return false;
  return !SCAFFOLD_DIRS.some((dir) => relPath.startsWith(dir));
};

const walkFiles = (root: string, base = root): string[] => {
  const out: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".expo" || entry.name === ".git") {
      continue;
    }
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full, base));
    } else {
      out.push(path.relative(base, full).replace(/\\/g, "/"));
    }
  }
  return out;
};

/** Gather one-line summaries from recently generated projects, newest first, capped. */
export const collectExamples = (
  workspaceRoot: string = getWorkspaceRoot(),
  maxFiles: number = MAX_EXAMPLE_FILES
): ExampleSummary[] => {
  let projectDirs: fs.Dirent[];
  try {
    projectDirs = fs.readdirSync(workspaceRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  const projects = projectDirs
    .filter((d) => d.isDirectory())
    .filter((d) => !EXCLUDED_PROJECT_PREFIXES.some((p) => d.name.startsWith(p)))
    .map((d) => {
      const full = path.join(workspaceRoot, d.name);
      let mtime = 0;
      try {
        mtime = fs.statSync(full).mtimeMs;
      } catch {
        mtime = 0;
      }
      return { name: d.name, full, mtime };
    })
    .sort((a, b) => b.mtime - a.mtime);

  const examples: ExampleSummary[] = [];
  for (const project of projects) {
    if (examples.length >= maxFiles) break;
    for (const relPath of walkFiles(project.full)) {
      if (examples.length >= maxFiles) break;
      if (!isIndexableExample(relPath)) continue;
      const contracts = extractExportContracts(path.join(project.full, relPath));
      if (!contracts || contracts.length === 0) continue;
      const exportSignature = contracts.map((c) => c.name).join(", ");
      examples.push({
        project: project.name,
        path: relPath,
        type: inferType(relPath),
        description: humanize(relPath),
        exportSignature,
      });
    }
  }
  return examples;
};

const cacheFilePath = (dir: string, model: string): string => {
  const slug = model.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return path.join(dir, `index-${slug}.json`);
};

const readCache = (dir: string, model: string): CachedIndex | null => {
  try {
    const raw = fs.readFileSync(cacheFilePath(dir, model), "utf-8");
    const parsed = JSON.parse(raw) as CachedIndex;
    if (parsed && typeof parsed.hash === "string" && Array.isArray(parsed.chunks)) {
      return parsed;
    }
  } catch {
    /* no usable cache */
  }
  return null;
};

const writeCache = (dir: string, index: CachedIndex): void => {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(cacheFilePath(dir, index.model), JSON.stringify(index), "utf-8");
  } catch {
    /* best-effort cache */
  }
};

const memory = new Map<string, EmbeddedChunk[]>();

export interface BuildIndexOptions {
  embedOptions?: EmbedOptions;
  cacheDir?: string;
  /** Injectable corpus for tests; defaults to gathering from disk. */
  corpus?: RagChunk[];
}

/**
 * Return the embedded index for the current corpus, or null when embeddings are
 * unavailable. Uses an in-memory cache, then a disk cache, then embeds fresh.
 */
export const buildOrLoadIndex = async (
  options: BuildIndexOptions = {}
): Promise<EmbeddedChunk[] | null> => {
  const dir = options.cacheDir ?? defaultCacheDir();
  const corpus =
    options.corpus ??
    assembleCorpus({ fixes: loadFixes(dir), examples: collectExamples() });
  if (corpus.length === 0) return null;

  const model = await resolveEmbeddingModel({
    url: options.embedOptions?.url,
    explicitModel: options.embedOptions?.model,
    fetchFn: options.embedOptions?.fetchFn,
  });
  if (!model) return null;

  const hash = corpusHash(corpus);
  const memoKey = `${model}:${hash}`;

  const cachedInMemory = memory.get(memoKey);
  if (cachedInMemory) return cachedInMemory;

  const diskCache = readCache(dir, model);
  if (diskCache && diskCache.hash === hash && diskCache.model === model) {
    memory.set(memoKey, diskCache.chunks);
    return diskCache.chunks;
  }

  const vectors = await embedTexts(
    corpus.map((c) => c.text),
    options.embedOptions
  );
  if (!vectors) return null;

  const embedded: EmbeddedChunk[] = corpus.map((chunk, i) => ({
    ...chunk,
    vector: vectors[i],
  }));

  memory.set(memoKey, embedded);
  writeCache(dir, { hash, model, chunks: embedded });
  return embedded;
};

/** Test/maintenance helper: drop the in-memory index cache. */
export const clearIndexMemory = (): void => memory.clear();
