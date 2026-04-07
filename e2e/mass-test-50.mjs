// Runs 50 enhanced project generations and persists both raw results and a normalized error knowledge base.
import WebSocket from "ws";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const LM_URL = process.env.MASS_TEST_LM_URL ?? "http://localhost:1234";
const AGENT_URL = process.env.MASS_TEST_AGENT_WS_URL ?? "ws://localhost:3100";
const AGENT_HTTP_URL = process.env.MASS_TEST_AGENT_HTTP_URL ?? "http://localhost:3100";
const MODEL = process.env.MASS_TEST_MODEL ?? "qwen/qwen3-coder-30b";
const ENHANCER_MODEL = process.env.MASS_TEST_ENHANCER_MODEL ?? "google/gemma-4-26b-a4b";
const RESULTS_FILE = "e2e/mass-test-results.json";
const ERROR_DB_FILE = "e2e/mass-test-error-db.json";
const SUMMARY_FILE = "e2e/mass-test-summary.md";
const TIMEOUT_MS = Number(process.env.MASS_TEST_TIMEOUT_MS ?? 300_000);
const PAUSE_MS = Number(process.env.MASS_TEST_PAUSE_MS ?? 2_000);
const SHOULD_RESUME = !process.argv.includes("--fresh");
const repoRoot = process.cwd();

const PROMPTS = [
  // Batch 1: Simple apps (1-10)
  "Todo list app",
  "Simple calculator",
  "Pomodoro timer",
  "Counter with increment and decrement",
  "Note taking app",
  "Flashcard quiz app",
  "Unit converter",
  "Tip calculator",
  "Color palette generator",
  "Random quote viewer",
  // Batch 2: Medium apps with Enhance (11-20)
  "Weather dashboard",
  "Expense tracker",
  "Habit tracker with streaks",
  "Recipe book app",
  "Workout log tracker",
  "Mood diary with calendar",
  "Book reading tracker",
  "Password generator",
  "BMI calculator with history",
  "Water intake tracker",
  // Batch 3: Complex apps with Enhance (21-30)
  "Task manager with kanban board",
  "Personal finance dashboard",
  "Meditation timer with sounds",
  "Language learning flashcards",
  "Grocery shopping list",
  "Simple chat messenger UI",
  "Photo gallery viewer",
  "Music playlist manager",
  "Daily journal with tags",
  "Countdown events tracker",
  // Batch 4: Themed apps with Enhance (31-40)
  "Dark cyberpunk todo app",
  "Retro pixel art calculator",
  "Minimalist zen timer",
  "Neon gaming score tracker",
  "Pastel mood board app",
  "Gothic dark diary",
  "Synthwave music player UI",
  "Nature themed weather app",
  "Space themed countdown timer",
  "Steampunk inventory tracker",
  // Batch 5: Specific features with Enhance (41-50)
  "App with tabs and settings",
  "App with search and filter list",
  "App with form validation",
  "App with dark mode toggle",
  "App with animated transitions",
  "App with local storage persistence",
  "App with swipe to delete list",
  "App with bottom sheet modal",
  "App with progress indicators",
  "App with onboarding screens",
];
const LIMIT = Number(process.env.MASS_TEST_LIMIT ?? PROMPTS.length);

function ensureDirectory(filePath) {
  fs.mkdirSync(path.dirname(path.join(repoRoot, filePath)), { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(repoRoot, filePath), "utf-8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  ensureDirectory(filePath);
  fs.writeFileSync(path.join(repoRoot, filePath), JSON.stringify(value, null, 2));
}

function sanitizeErrorText(errorText) {
  return String(errorText)
    .replace(/\r/g, "")
    .replace(/D:\/experement2\/workspace\/[^\s"')]+/gi, "<workspace-project>")
    .replace(/D:\\experement2\\workspace\\[^\s"')]+/gi, "<workspace-project>")
    .replace(/\(\d+,\d+\)/g, "(line,col)")
    .replace(/line \d+/gi, "line <n>")
    .replace(/\b\d+\.\d+s\b/g, "<seconds>")
    .replace(/\b\d+\b/g, (match) => (/^TS\d{4}$/.test(match) ? match : "<n>"))
    .replace(/\s+/g, " ")
    .trim();
}

function detectCategory(errorText) {
  const text = String(errorText);

  if (text.includes("Plan validation failed")) return "plan_validation";
  if (text.includes("Contract violations")) return "contract_violation";

  const tsCodeMatch = text.match(/\bTS\d{4}\b/);
  if (tsCodeMatch) {
    return `typescript_${tsCodeMatch[0].toLowerCase()}`;
  }

  if (/named export|default export/i.test(text)) return "import_export_mismatch";
  if (/missing dependency|missing from plan\.files/i.test(text)) return "missing_plan_dependency";
  if (/ThemeInverse/i.test(text)) return "unsupported_tamagui_themeinverse";
  if (/Pressable/i.test(text) && /tamagui/i.test(text)) return "unsupported_tamagui_pressable";
  if (/tabBarIcon|assignable to type/i.test(text) && /app\/\(tabs\)\/_layout\.tsx/i.test(text)) {
    return "invalid_tab_icon";
  }
  if (/Cannot find name/i.test(text)) return "missing_symbol";
  if (/implicitly has an 'any' type/i.test(text)) return "implicit_any";
  if (/No overload matches/i.test(text)) return "overload_mismatch";
  if (/smoke gate/i.test(text)) return "native_smoke_gate";
  if (/Typecheck failed/i.test(text)) return "typecheck_failure";
  if (/Static validation failed/i.test(text)) return "static_validation_failure";

  return "other";
}

function buildSignature(errorText) {
  const sanitized = sanitizeErrorText(errorText);
  const tsCode = sanitized.match(/\bTS\d{4}\b/)?.[0] ?? "generic";
  const head = sanitized
    .replace(/^Typecheck failed:\s*/i, "")
    .replace(/^Plan validation failed:\s*/i, "")
    .replace(/^Contract violations in .*? after <n> retries:\s*/i, "")
    .slice(0, 180);
  return `${tsCode}:${head}`;
}

function toErrorRecords(result) {
  return (result.errors ?? []).map((errorText) => ({
    category: detectCategory(errorText),
    signature: buildSignature(errorText),
    sample: String(errorText),
    sanitized: sanitizeErrorText(errorText),
    tsCodes: [...new Set(String(errorText).match(/\bTS\d{4}\b/g) ?? [])],
  }));
}

function buildErrorDatabase(results) {
  const categoryMap = new Map();
  const signatureMap = new Map();

  for (const result of results) {
    for (const errorRecord of toErrorRecords(result)) {
      const categoryEntry = categoryMap.get(errorRecord.category) ?? {
        category: errorRecord.category,
        count: 0,
        samples: [],
        projects: new Set(),
        signatures: new Set(),
        tsCodes: new Set(),
      };
      categoryEntry.count += 1;
      categoryEntry.projects.add(result.name);
      categoryEntry.signatures.add(errorRecord.signature);
      for (const code of errorRecord.tsCodes) {
        categoryEntry.tsCodes.add(code);
      }
      if (categoryEntry.samples.length < 5) {
        categoryEntry.samples.push(errorRecord.sample);
      }
      categoryMap.set(errorRecord.category, categoryEntry);

      const signatureEntry = signatureMap.get(errorRecord.signature) ?? {
        signature: errorRecord.signature,
        category: errorRecord.category,
        count: 0,
        sample: errorRecord.sample,
        projects: new Set(),
      };
      signatureEntry.count += 1;
      signatureEntry.projects.add(result.name);
      signatureMap.set(errorRecord.signature, signatureEntry);
    }
  }

  const stats = {
    total: results.length,
    ready: results.filter((result) => result.status === "ready").length,
    error: results.filter((result) => result.status === "error").length,
    timeout: results.filter((result) => result.status === "timeout").length,
    ws_error: results.filter((result) => result.status === "ws_error").length,
  };

  return {
    generatedAt: new Date().toISOString(),
    config: {
      lmUrl: LM_URL,
      agentWsUrl: AGENT_URL,
      model: MODEL,
      enhancerModel: ENHANCER_MODEL,
      timeoutMs: TIMEOUT_MS,
      promptCount: results.length,
    },
    stats,
    categories: [...categoryMap.values()]
      .map((entry) => ({
        category: entry.category,
        count: entry.count,
        projectCount: entry.projects.size,
        projects: [...entry.projects].sort(),
        signatures: [...entry.signatures].sort(),
        tsCodes: [...entry.tsCodes].sort(),
        samples: entry.samples,
      }))
      .sort((a, b) => b.count - a.count),
    signatures: [...signatureMap.values()]
      .map((entry) => ({
        signature: entry.signature,
        category: entry.category,
        count: entry.count,
        projects: [...entry.projects].sort(),
        sample: entry.sample,
      }))
      .sort((a, b) => b.count - a.count),
  };
}

function buildSummary(results, errorDatabase, elapsedSeconds) {
  const lines = [
    "# Mass Enhance E2E Summary",
    "",
    `- Generated at: ${new Date().toISOString()}`,
    `- Total prompts: ${results.length}`,
    `- Ready: ${errorDatabase.stats.ready}`,
    `- Error: ${errorDatabase.stats.error}`,
    `- Timeout: ${errorDatabase.stats.timeout}`,
    `- WS error: ${errorDatabase.stats.ws_error}`,
    `- Elapsed seconds: ${elapsedSeconds}`,
    "",
    "## Top Categories",
    "",
  ];

  for (const category of errorDatabase.categories.slice(0, 15)) {
    lines.push(`- ${category.category}: ${category.count} hits across ${category.projectCount} projects`);
  }

  lines.push("", "## Top Signatures", "");
  for (const signature of errorDatabase.signatures.slice(0, 15)) {
    lines.push(`- ${signature.signature} (${signature.count})`);
  }

  lines.push("", "## Failed Projects", "");
  for (const result of results.filter((item) => item.status !== "ready")) {
    lines.push(`- ${result.index}. ${result.name}: ${result.status} :: ${result.errors[0] ?? "no captured error"}`);
  }

  return lines.join("\n");
}

function persistArtifacts(results, elapsedSeconds = 0) {
  writeJson(RESULTS_FILE, results);
  const errorDatabase = buildErrorDatabase(results);
  writeJson(ERROR_DB_FILE, errorDatabase);
  ensureDirectory(SUMMARY_FILE);
  fs.writeFileSync(path.join(repoRoot, SUMMARY_FILE), buildSummary(results, errorDatabase, elapsedSeconds), "utf-8");
  return errorDatabase;
}

async function ensureAgentReady() {
  const response = await fetch(`${AGENT_HTTP_URL}/health`);
  if (!response.ok) {
    throw new Error(`Agent health check failed: ${response.status}`);
  }
}

async function enhance(prompt) {
  try {
    const resp = await fetch(`${AGENT_HTTP_URL}/api/llm/enhance`, {
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

function runTest(index, name, description) {
  return new Promise((resolve) => {
    const result = {
      index: index + 1,
      name,
      originalPrompt: name,
      enhancedPrompt: description,
      status: null,
      filesGenerated: 0,
      filesCompleted: [],
      errors: [],
      autofixes: 0,
      contractViolations: 0,
      timeSeconds: 0,
      events: [],
      requestId: crypto.randomUUID(),
      errorRecords: [],
    };
    const start = Date.now();
    const ws = new WebSocket(AGENT_URL);
    let timeout;

    const finish = (status) => {
      clearTimeout(timeout);
      result.status = status;
      result.timeSeconds = Number(((Date.now() - start) / 1000).toFixed(1));
      ws.close();
      resolve(result);
    };

    // 5 minute timeout per test
    timeout = setTimeout(() => finish("timeout"), TIMEOUT_MS);

    ws.on("open", () => {
      ws.send(JSON.stringify({
        type: "create_project",
        description,
        requestId: result.requestId,
        lmStudioUrl: LM_URL,
        model: MODEL,
        temperature: 0.46,
        maxTokens: 64000,
      }));
    });

    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());

      if (msg.type === "status") result.events.push(msg.status);
      if (msg.type === "file_complete") result.filesCompleted.push(msg.filepath);
      if (msg.type === "generation_complete") result.filesGenerated = msg.filesCount;
      if (msg.type === "autofix_start") result.autofixes++;
      if (msg.type === "preview_status" && msg.previewStatus) result.events.push(`preview:${msg.previewStatus}`);
      if (msg.type === "system_error") {
        result.errors.push(msg.error.substring(0, 300));
        if (msg.error.includes("Contract violation") || msg.error.includes("Contract violations")) {
          result.contractViolations++;
        }
      }

      if (msg.type === "status" && ["error", "idle", "ready"].includes(msg.status)) {
        result.errorRecords = toErrorRecords(result);
        finish(msg.status);
      }
    });

    ws.on("error", () => finish("ws_error"));
  });
}

async function main() {
  console.log("=== MASS E2E TEST: 50 APPS ===\n");
  const globalStart = Date.now();
  await ensureAgentReady();
  const existingResults = SHOULD_RESUME ? readJson(RESULTS_FILE, []) : [];
  const results = Array.isArray(existingResults) ? existingResults : [];
  const completedPrompts = new Set(results.map((result) => result.originalPrompt));
  const promptsToRun = PROMPTS.slice(0, LIMIT).filter((prompt) => !completedPrompts.has(prompt));

  if (results.length > 0 && SHOULD_RESUME) {
    console.log(`Resuming from ${results.length} existing results...`);
  }

  for (let i = 0; i < promptsToRun.length; i++) {
    const prompt = promptsToRun[i];
    const absoluteIndex = PROMPTS.indexOf(prompt);
    const batch = Math.floor(i / 10) + 1;
    const useEnhance = true; // ALL tests use Enhance via Gemma

    let description = prompt;
    if (useEnhance) {
      process.stdout.write(`[${absoluteIndex + 1}/${Math.min(PROMPTS.length, LIMIT)}] Enhancing: ${prompt}...`);
      description = await enhance(prompt);
      console.log(" OK");
    }

    process.stdout.write(`[${absoluteIndex + 1}/${Math.min(PROMPTS.length, LIMIT)}] Generating: ${prompt}... `);
    const result = await runTest(absoluteIndex, prompt, description);
    const icon = result.status === "ready" ? "✅" : result.status === "error" ? "❌" : "⏰";
    console.log(`${icon} ${result.status} (${result.timeSeconds}s, ${result.filesCompleted.length} files, ${result.errors.length} err)`);

    results.push(result);
    persistArtifacts(results, Math.round((Date.now() - globalStart) / 1000));

    // Brief pause between tests
    await new Promise((r) => setTimeout(r, PAUSE_MS));

    // Save intermediate results
    if ((i + 1) % 10 === 0) {
      persistArtifacts(results, Math.round((Date.now() - globalStart) / 1000));
      const wins = results.filter((r) => r.status === "ready").length;
      const fails = results.filter((r) => r.status === "error").length;
      const timeouts = results.filter((r) => r.status === "timeout").length;
      console.log(`\n--- Batch ${batch} complete: ${wins} WIN, ${fails} FAIL, ${timeouts} TIMEOUT ---\n`);
    }
  }

  // Final save
  const elapsed = Math.round((Date.now() - globalStart) / 1000);
  const errorDatabase = persistArtifacts(results, elapsed);
  const wins = results.filter((r) => r.status === "ready").length;
  const fails = results.filter((r) => r.status === "error").length;
  const timeouts = results.filter((r) => r.status === "timeout").length;

  console.log("\n" + "=".repeat(70));
  console.log("MASS E2E TEST RESULTS: 50 APPS");
  console.log("=".repeat(70));
  console.log(`✅ READY:   ${wins}/50 (${(wins / 50 * 100).toFixed(0)}%)`);
  console.log(`❌ ERROR:   ${fails}/50`);
  console.log(`⏰ TIMEOUT: ${timeouts}/50`);
  console.log(`⏱  Total:   ${elapsed}s (~${Math.round(elapsed / 60)}min)`);
  console.log("=".repeat(70));

  console.log("\nERROR CATEGORIES:");
  for (const category of errorDatabase.categories.slice(0, 15)) {
    console.log(`  ${category.count}x ${category.category}`);
  }

  console.log("\nDETAILED FAILURES:");
  for (const r of results.filter((r) => r.status !== "ready")) {
    console.log(`  ${r.index}. ${r.name}: ${r.status} (${r.errors[0]?.substring(0, 100) || "no error msg"})`);
  }

  console.log("\n" + "=".repeat(70));
  console.log(`Results saved to ${RESULTS_FILE}`);
  console.log(`Error DB saved to ${ERROR_DB_FILE}`);
  console.log(`Summary saved to ${SUMMARY_FILE}`);
  process.exit(wins >= 25 ? 0 : 1);
}

main().catch(console.error);
