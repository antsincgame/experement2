// Grand Soak Test v2 — 50 diverse apps, post-RAG-patch validation marathon.
// Reuses proven patterns from mass-test-50.mjs with cleanup between runs.
import WebSocket from "ws";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const AGENT_HTTP = "http://127.0.0.1:3100";
const AGENT_WS = "ws://127.0.0.1:3100";
const LM_URL = process.env.LM_URL ?? "http://localhost:1234";
const MODEL = process.env.MODEL ?? "qwen/qwen3-coder-30b";
const ENHANCER_MODEL = process.env.ENHANCER_MODEL ?? "google/gemma-4-26b-a4b";
const TIMEOUT_MS = 300_000; // 5 min per app
const PAUSE_MS = 3_000;
const RESULTS_FILE = "e2e/grand-soak-results.json";
const SUMMARY_FILE = "e2e/grand-soak-summary.md";
const repoRoot = process.cwd();

const PROMPTS = [
  // --- Batch 1: Core utility apps (1-10) ---
  "Simple calculator with history",
  "Todo list with categories and priority",
  "Pomodoro timer with session tracking",
  "Note taking app with search",
  "Unit converter for length, weight, temperature",
  "Tip calculator with split bill",
  "Expense tracker with pie chart",
  "Habit tracker with daily streaks",
  "Water intake tracker with daily goal",
  "BMI calculator with result history",

  // --- Batch 2: Lifestyle & health (11-20) ---
  "Workout log with exercise sets and reps",
  "Meal calorie counter",
  "Sleep quality tracker with weekly chart",
  "Mood diary with emoji ratings",
  "Step counter dashboard",
  "Meditation timer with bell sound",
  "Daily gratitude journal",
  "Blood pressure log with trend chart",
  "Pill reminder with schedule list",
  "Yoga pose library with favorites",

  // --- Batch 3: Productivity & finance (21-30) ---
  "Personal budget planner with bar chart",
  "Countdown events tracker",
  "Flashcard quiz app with spaced repetition",
  "Shopping list with checkboxes",
  "Recipe book with ingredients list",
  "Book reading tracker with progress bar",
  "Password generator with strength meter",
  "Task manager with drag-and-drop priority",
  "Time zone converter",
  "Savings goal tracker with progress ring",

  // --- Batch 4: Creative & themed (31-40) ---
  "Color palette generator with copy hex",
  "Random quote viewer with favorites",
  "Dice roller for board games",
  "Scoreboard for card games",
  "Emoji mood board creator",
  "Daily affirmation app with swipe cards",
  "Trivia quiz with multiple choice",
  "Pet care tracker with feeding schedule",
  "Plant watering reminder",
  "Birthday reminder with countdown",

  // --- Batch 5: Advanced UI patterns (41-50) ---
  "App with tabs and settings page",
  "App with search bar and filterable list",
  "App with form validation and error messages",
  "App with dark mode toggle in settings",
  "App with animated card transitions",
  "App with local storage persistence",
  "App with swipe-to-delete list items",
  "App with bottom sheet modal form",
  "App with progress indicators and loading states",
  "App with onboarding walkthrough screens",
];

function writeJson(filePath, data) {
  const fullPath = path.join(repoRoot, filePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2));
}

function sanitizeError(text) {
  return String(text)
    .replace(/\r/g, "")
    .replace(/D:[/\\]experement2[/\\]workspace[/\\][^\s"')]+/gi, "<ws>")
    .replace(/\(\d+,\d+\)/g, "(L,C)")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

function classifyError(raw) {
  const text = String(raw);
  const tsMatch = text.match(/TS(\d{4})/);
  if (tsMatch) return `TS${tsMatch[1]}`;
  if (text.includes("Plan validation")) return "PLAN_VALIDATION";
  if (text.includes("Contract violation")) return "CONTRACT_VIOLATION";
  if (text.includes("Static validation")) return "STATIC_VALIDATION";
  if (text.includes("timeout") || text.includes("Timeout")) return "TIMEOUT";
  return "OTHER";
}

async function healthCheck() {
  const resp = await fetch(`${AGENT_HTTP}/health`);
  if (!resp.ok) throw new Error(`Agent down: ${resp.status}`);
  console.log("Agent health: OK");
}

async function cleanupWorkspace() {
  try {
    const resp = await fetch(`${AGENT_HTTP}/api/projects/all`, {
      method: "DELETE",
      headers: { "x-app-factory-confirm": "delete-workspace" },
    });
    const data = await resp.json();
    if (data.data?.deleted > 0) {
      console.log(`  Cleaned ${data.data.deleted} old project(s)`);
    }
  } catch {
    // workspace already empty
  }
}

async function enhance(prompt) {
  try {
    const resp = await fetch(`${AGENT_HTTP}/api/llm/enhance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, lmStudioUrl: LM_URL, model: ENHANCER_MODEL }),
    });
    const data = await resp.json();
    return data.data || prompt;
  } catch {
    return prompt;
  }
}

function runProject(index, name, description) {
  return new Promise((resolve) => {
    const result = {
      index,
      name,
      description,
      status: null,
      filesGenerated: 0,
      filesCompleted: [],
      errors: [],
      autofixAttempts: 0,
      autofixSuccesses: 0,
      timeSeconds: 0,
      events: [],
    };
    const start = Date.now();
    const ws = new WebSocket(AGENT_WS);
    let timer;

    const finish = (status) => {
      clearTimeout(timer);
      result.status = status;
      result.timeSeconds = +((Date.now() - start) / 1000).toFixed(1);
      try { ws.close(); } catch {}
      resolve(result);
    };

    timer = setTimeout(() => finish("timeout"), TIMEOUT_MS);

    ws.on("open", () => {
      ws.send(JSON.stringify({
        type: "create_project",
        description,
        requestId: crypto.randomUUID(),
        lmStudioUrl: LM_URL,
        model: MODEL,
        temperature: 0.46,
        maxTokens: 64000,
      }));
    });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === "status") result.events.push(msg.status);
        if (msg.type === "file_complete") result.filesCompleted.push(msg.filepath);
        if (msg.type === "generation_complete") result.filesGenerated = msg.filesCount;
        if (msg.type === "autofix_start") result.autofixAttempts++;
        if (msg.type === "autofix_success") result.autofixSuccesses++;
        if (msg.type === "system_error") result.errors.push(msg.error?.substring(0, 500) ?? "unknown");

        if (msg.type === "status" && ["error", "idle", "ready"].includes(msg.status)) {
          finish(msg.status);
        }
      } catch {}
    });

    ws.on("error", () => finish("ws_error"));
  });
}

function buildReport(results, elapsedSec) {
  const ready = results.filter((r) => r.status === "ready");
  const errors = results.filter((r) => r.status === "error");
  const timeouts = results.filter((r) => r.status === "timeout");
  const wsErrors = results.filter((r) => r.status === "ws_error");

  const totalAutofixAttempts = results.reduce((s, r) => s + r.autofixAttempts, 0);
  const totalAutofixSuccesses = results.reduce((s, r) => s + r.autofixSuccesses, 0);

  // Error classification
  const errorGroups = new Map();
  for (const r of errors) {
    for (const err of r.errors) {
      const cls = classifyError(err);
      const group = errorGroups.get(cls) ?? { count: 0, projects: [], sample: sanitizeError(err) };
      group.count++;
      group.projects.push(r.name);
      errorGroups.set(cls, group);
    }
  }

  const sortedGroups = [...errorGroups.entries()].sort((a, b) => b[1].count - a[1].count);

  const lines = [
    "# Grand Soak Test v2 — Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Elapsed: ${elapsedSec}s (~${Math.round(elapsedSec / 60)}min)`,
    `Model: ${MODEL} | Enhancer: ${ENHANCER_MODEL}`,
    "",
    "## Global Win Rate",
    "",
    `| Status | Count | Rate |`,
    `|--------|-------|------|`,
    `| READY  | ${ready.length} | **${((ready.length / results.length) * 100).toFixed(0)}%** |`,
    `| ERROR  | ${errors.length} | ${((errors.length / results.length) * 100).toFixed(0)}% |`,
    `| TIMEOUT | ${timeouts.length} | ${((timeouts.length / results.length) * 100).toFixed(0)}% |`,
    `| WS_ERR | ${wsErrors.length} | ${((wsErrors.length / results.length) * 100).toFixed(0)}% |`,
    "",
    "## Auto-Fixer Effectiveness",
    "",
    `- Total autofix attempts: ${totalAutofixAttempts}`,
    `- Successful autofixes: ${totalAutofixSuccesses}`,
    `- Fix rate: ${totalAutofixAttempts > 0 ? ((totalAutofixSuccesses / totalAutofixAttempts) * 100).toFixed(0) : 0}%`,
    "",
    "## Error Classification (The Graveyard)",
    "",
  ];

  if (sortedGroups.length === 0) {
    lines.push("No errors! Perfect run.");
  } else {
    lines.push("| Category | Count | Projects |");
    lines.push("|----------|-------|----------|");
    for (const [cls, group] of sortedGroups) {
      lines.push(`| ${cls} | ${group.count} | ${group.projects.join(", ")} |`);
    }
    lines.push("");
    lines.push("### Error Samples");
    lines.push("");
    for (const [cls, group] of sortedGroups.slice(0, 10)) {
      lines.push(`**${cls}:** \`${group.sample}\``);
      lines.push("");
    }
  }

  lines.push("## Successful Projects");
  lines.push("");
  for (const r of ready) {
    lines.push(`- ${r.index}. ${r.name} (${r.timeSeconds}s, ${r.filesCompleted.length} files${r.autofixAttempts > 0 ? `, ${r.autofixAttempts} autofix` : ""})`);
  }

  lines.push("");
  lines.push("## Failed Projects");
  lines.push("");
  for (const r of [...errors, ...timeouts, ...wsErrors]) {
    const errSummary = r.errors[0] ? sanitizeError(r.errors[0]).slice(0, 120) : "no error captured";
    lines.push(`- ${r.index}. ${r.name}: **${r.status}** — ${errSummary}`);
  }

  lines.push("");
  lines.push("## Hardware Health");
  lines.push("");
  lines.push(`- Agent crashes: ${wsErrors.length}`);
  lines.push(`- Timeouts (Metro hang): ${timeouts.length}`);
  lines.push(`- Total projects processed: ${results.length}`);

  return lines.join("\n");
}

async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   GRAND SOAK TEST v2 — 50 APPS MARATHON     ║");
  console.log("║   Post-RAG-Patch Validation                  ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  const globalStart = Date.now();
  await healthCheck();

  const results = [];

  for (let i = 0; i < PROMPTS.length; i++) {
    const prompt = PROMPTS[i];

    // Cleanup before each run to save SSD space
    await cleanupWorkspace();

    // Enhance prompt via Gemma
    process.stdout.write(`[${i + 1}/50] Enhancing: "${prompt}"... `);
    const enhanced = await enhance(prompt);
    console.log("OK");

    // Generate project
    process.stdout.write(`[${i + 1}/50] Generating... `);
    const result = runProject(i + 1, prompt, enhanced);
    const r = await result;

    const icon = r.status === "ready" ? "✅" : r.status === "error" ? "❌" : r.status === "timeout" ? "⏰" : "💥";
    console.log(`${icon} ${r.status} (${r.timeSeconds}s, ${r.filesCompleted.length} files, autofix: ${r.autofixAttempts}/${r.autofixSuccesses})`);

    results.push(r);

    // Save intermediate results after every run
    writeJson(RESULTS_FILE, results);

    // Batch summary every 10
    if ((i + 1) % 10 === 0) {
      const wins = results.filter((x) => x.status === "ready").length;
      const fails = results.filter((x) => x.status !== "ready").length;
      console.log(`\n── Batch ${Math.floor(i / 10) + 1}/5 ── WIN: ${wins} | FAIL: ${fails} | Rate: ${((wins / results.length) * 100).toFixed(0)}% ──\n`);
    }

    // Brief pause between tests
    await new Promise((r) => setTimeout(r, PAUSE_MS));
  }

  // Final report
  const elapsed = Math.round((Date.now() - globalStart) / 1000);
  const report = buildReport(results, elapsed);
  const reportPath = path.join(repoRoot, SUMMARY_FILE);
  fs.writeFileSync(reportPath, report, "utf-8");
  writeJson(RESULTS_FILE, results);

  const wins = results.filter((r) => r.status === "ready").length;
  console.log("\n" + "═".repeat(60));
  console.log(`GRAND SOAK TEST v2 COMPLETE`);
  console.log(`WIN RATE: ${wins}/50 (${((wins / 50) * 100).toFixed(0)}%)`);
  console.log(`Report: ${SUMMARY_FILE}`);
  console.log(`Results: ${RESULTS_FILE}`);
  console.log("═".repeat(60));
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
