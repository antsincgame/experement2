#!/usr/bin/env node
// Phase 4 (the ultimate accretive lever): export the accumulated, QUALITY-SCORED harness
// corpus to JSONL training sets for an optional offline LoRA fine-tune / distillation.
// READ-ONLY over the .rag stores the pipeline already maintains. Training itself is
// external (LM Studio / llama.cpp); this only produces the data + a balance report, and
// the resulting adapter is promoted ONLY if it beats the mass-test baseline (Phase 1).
//
// Usage:  node scripts/export-training-set.mjs   (EXPORT_SCORE_MIN=80 by default)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const ragDir = path.resolve(scriptDir, "..", ".rag");
const outDir = path.join(ragDir, "training");

const SCORE_MIN = Number(process.env.EXPORT_SCORE_MIN) || 80;

const readJson = (p) => {
  try {
    const v = JSON.parse(fs.readFileSync(p, "utf-8"));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

const exemplars = readJson(path.join(ragDir, "exemplars.json"));
const fixes = readJson(path.join(ragDir, "error-fixes.json"));

// SFT set: only HIGH-QUALITY generations (Phase-1/3 score gate) → (intent → ideal file).
const seen = new Set();
const sft = [];
for (const e of exemplars) {
  if (typeof e?.code !== "string" || (e.score ?? 0) < SCORE_MIN) continue;
  const key = e.hash ?? e.code;
  if (seen.has(key)) continue; // dedup (store already dedups by hash; belt-and-suspenders)
  seen.add(key);
  sft.push({
    messages: [
      { role: "user", content: `Generate the ${e.type} file for: ${e.description}` },
      { role: "assistant", content: e.code },
    ],
    meta: { type: e.type, score: e.score ?? 0, source: e.source ?? "clean" },
  });
}

// Repair set: error → fix (teaches the model to self-correct its common mistakes).
const repair = fixes
  .filter((f) => typeof f?.fixSummary === "string" && f.fixSummary.length > 0)
  .map((f) => ({
    messages: [
      { role: "user", content: `Fix this error in ${f.file}:\n${f.errorSignature}` },
      { role: "assistant", content: f.fixSummary },
    ],
    meta: { file: f.file },
  }));

fs.mkdirSync(outDir, { recursive: true });
const sftPath = path.join(outDir, "sft-generations.jsonl");
const repairPath = path.join(outDir, "error-fixes.jsonl");
const toJsonl = (rows) => (rows.length ? rows.map((r) => JSON.stringify(r)).join("\n") + "\n" : "");
fs.writeFileSync(sftPath, toJsonl(sft), "utf-8");
fs.writeFileSync(repairPath, toJsonl(repair), "utf-8");

const byType = {};
for (const r of sft) byType[r.meta.type] = (byType[r.meta.type] ?? 0) + 1;

console.log("=== Training-set export (Phase 4) ===");
console.log(`SFT generations (score >= ${SCORE_MIN}): ${sft.length} → ${path.relative(process.cwd(), sftPath)}`);
console.log(`  by type: ${Object.entries(byType).map(([t, n]) => `${t}:${n}`).join(", ") || "(none)"}`);
console.log(`Error->fix pairs: ${repair.length} → ${path.relative(process.cwd(), repairPath)}`);
if (sft.length === 0 && repair.length === 0) {
  console.log("\n(No corpus yet — run generations with the quality harness to accumulate");
  console.log(" high-score exemplars + error->fix pairs, then re-run this export.)");
} else {
  console.log("\nNext: train a LoRA adapter on these JSONL sets offline, then A/B it against");
  console.log("the base model with `node e2e/mass-test-50.mjs` — promote ONLY if it beats the");
  console.log("baseline ready-rate + median quality (no adapter ships without winning the eval).");
}
