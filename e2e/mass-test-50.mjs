// Mass E2E test — 50 apps with Enhance, sequential via WebSocket
import WebSocket from "ws";
import fs from "fs";

const LM_URL = "http://localhost:1234";
const AGENT_URL = "ws://localhost:3100";
const MODEL = "qwen/qwen3-coder-30b";
const ENHANCER_MODEL = "google/gemma-4-26b-a4b";
const RESULTS_FILE = "e2e/mass-test-results.json";

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

async function enhance(prompt) {
  try {
    const resp = await fetch("http://localhost:3100/api/llm/enhance", {
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
      enhancedPrompt: description.substring(0, 150),
      status: null,
      filesGenerated: 0,
      filesCompleted: [],
      errors: [],
      autofixes: 0,
      contractViolations: 0,
      timeSeconds: 0,
      events: [],
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
    timeout = setTimeout(() => finish("timeout"), 300_000);

    ws.on("open", () => {
      ws.send(JSON.stringify({
        type: "create_project",
        description,
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
      if (msg.type === "system_error") {
        result.errors.push(msg.error.substring(0, 300));
        if (msg.error.includes("Contract violation")) result.contractViolations++;
      }

      if (msg.type === "status" && ["error", "idle", "ready"].includes(msg.status)) {
        finish(msg.status);
      }
    });

    ws.on("error", () => finish("ws_error"));
  });
}

async function main() {
  console.log("=== MASS E2E TEST: 50 APPS ===\n");
  const globalStart = Date.now();
  const results = [];

  for (let i = 0; i < PROMPTS.length; i++) {
    const prompt = PROMPTS[i];
    const batch = Math.floor(i / 10) + 1;
    const useEnhance = true; // ALL tests use Enhance via Gemma

    let description = prompt;
    if (useEnhance) {
      process.stdout.write(`[${i + 1}/50] Enhancing: ${prompt}...`);
      description = await enhance(prompt);
      console.log(" OK");
    }

    process.stdout.write(`[${i + 1}/50] Generating: ${prompt}... `);
    const result = await runTest(i, prompt, description);
    const icon = result.status === "ready" ? "✅" : result.status === "error" ? "❌" : "⏰";
    console.log(`${icon} ${result.status} (${result.timeSeconds}s, ${result.filesCompleted.length} files, ${result.errors.length} err)`);

    results.push(result);

    // Brief pause between tests
    await new Promise((r) => setTimeout(r, 2000));

    // Save intermediate results
    if ((i + 1) % 10 === 0) {
      fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
      const wins = results.filter((r) => r.status === "ready").length;
      const fails = results.filter((r) => r.status === "error").length;
      const timeouts = results.filter((r) => r.status === "timeout").length;
      console.log(`\n--- Batch ${batch} complete: ${wins} WIN, ${fails} FAIL, ${timeouts} TIMEOUT ---\n`);
    }
  }

  // Final save
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));

  const elapsed = Math.round((Date.now() - globalStart) / 1000);
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

  // Error categorization
  const errorCategories = {};
  for (const r of results) {
    for (const err of r.errors) {
      const cat = categorizeError(err);
      errorCategories[cat] = (errorCategories[cat] || 0) + 1;
    }
  }
  console.log("\nERROR CATEGORIES:");
  for (const [cat, count] of Object.entries(errorCategories).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count}x ${cat}`);
  }

  console.log("\nDETAILED FAILURES:");
  for (const r of results.filter((r) => r.status !== "ready")) {
    console.log(`  ${r.index}. ${r.name}: ${r.status} (${r.errors[0]?.substring(0, 100) || "no error msg"})`);
  }

  console.log("\n" + "=".repeat(70));
  console.log(`Results saved to ${RESULTS_FILE}`);
  process.exit(wins >= 25 ? 0 : 1);
}

function categorizeError(err) {
  if (err.includes("TS2305")) return "TS2305: Module has no exported member";
  if (err.includes("TS2322")) return "TS2322: Type mismatch";
  if (err.includes("TS2339")) return "TS2339: Property does not exist";
  if (err.includes("TS2345")) return "TS2345: Argument type mismatch";
  if (err.includes("TS2554")) return "TS2554: Wrong argument count";
  if (err.includes("TS2304")) return "TS2304: Cannot find name";
  if (err.includes("TS2741")) return "TS2741: Missing property";
  if (err.includes("TS1002")) return "TS1002: Unterminated string (truncation)";
  if (err.includes("TS2769")) return "TS2769: No overload matches";
  if (err.includes("missing dependency")) return "Missing npm dependency";
  if (err.includes("Contract violation")) return "Contract violation (import mismatch)";
  if (err.includes("cannot be resolved")) return "Missing local import";
  if (err.includes("Static validation")) return "Static validation failed";
  if (err.includes("Plan validation")) return "Plan validation failed";
  if (err.includes("smoke gate")) return "Native smoke gate failed";
  if (err.includes("No files were generated")) return "Empty generation";
  return "Other: " + err.substring(0, 60);
}

main().catch(console.error);
