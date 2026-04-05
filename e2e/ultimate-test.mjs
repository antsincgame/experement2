// Ultimate field test — generates 3 apps via WebSocket and reports results
import WebSocket from "ws";

const LM_URL = "http://localhost:1234";
const AGENT_URL = "ws://localhost:3100";
const MODEL = "qwen/qwen3-coder-30b";

const tests = [
  { name: "Todo", desc: "Simple todo list app with add, complete, and delete tasks", enhance: false },
  { name: "Habits", desc: "Habit tracker with daily streaks", enhance: true },
  { name: "Expenses", desc: "Expense tracker with pie chart", enhance: true },
];

async function enhance(prompt) {
  const resp = await fetch("http://localhost:3100/api/llm/enhance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, lmStudioUrl: LM_URL }),
  });
  const data = await resp.json();
  return data.data || prompt;
}

function runTest(name, description) {
  return new Promise((resolve) => {
    const result = { name, status: null, files: [], errors: [], autofixes: [], events: [] };
    const start = Date.now();
    const ws = new WebSocket(AGENT_URL);

    ws.on("open", () => {
      console.log(`\n[${"=".repeat(40)}]`);
      console.log(`[${name}] STARTED`);
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

      if (msg.type === "status") {
        result.events.push(msg.status);
        console.log(`[${name}] -> ${msg.status}`);
      }
      if (msg.type === "file_complete") {
        result.files.push(msg.filepath);
        console.log(`[${name}]   file: ${msg.filepath}`);
      }
      if (msg.type === "generation_complete") {
        console.log(`[${name}]   generated ${msg.filesCount} files`);
      }
      if (msg.type === "autofix_start") {
        result.autofixes.push(`${msg.file}: ${msg.error.substring(0, 80)}`);
        console.log(`[${name}]   autofix: ${msg.file}`);
      }
      if (msg.type === "system_error") {
        result.errors.push(msg.error.substring(0, 300));
        console.log(`[${name}]   ERROR: ${msg.error.substring(0, 150)}`);
      }

      if (msg.type === "status" && ["error", "idle", "ready"].includes(msg.status)) {
        result.status = msg.status;
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        const icon = msg.status === "error" ? "FAIL" : "WIN";
        console.log(`[${name}] >>> ${icon} (${elapsed}s, ${result.files.length} files, ${result.errors.length} errors, ${result.autofixes.length} autofixes) <<<`);
        ws.close();
        resolve(result);
      }
    });

    ws.on("error", (err) => {
      result.errors.push("WS: " + err.message);
      result.status = "ws_error";
      resolve(result);
    });
  });
}

async function main() {
  console.log("=== ULTIMATE FIELD TEST ===\n");
  const globalStart = Date.now();
  const results = [];

  for (const test of tests) {
    let desc = test.desc;
    if (test.enhance) {
      console.log(`[${test.name}] Enhancing prompt...`);
      desc = await enhance(desc);
      console.log(`[${test.name}] Enhanced: ${desc.substring(0, 80)}...`);
    }
    const result = await runTest(test.name, desc);
    results.push(result);
    await new Promise((r) => setTimeout(r, 2000));
  }

  const elapsed = ((Date.now() - globalStart) / 1000).toFixed(0);
  console.log("\n" + "=".repeat(60));
  console.log("ULTIMATE TEST RESULTS");
  console.log("=".repeat(60));

  let wins = 0;
  for (const r of results) {
    const icon = r.status === "error" ? "FAIL" : "WIN";
    if (r.status !== "error") wins++;
    console.log(`  ${icon}  ${r.name}: ${r.status} (${r.files.length} files, ${r.errors.length} errors)`);
    if (r.errors.length > 0) {
      r.errors.forEach((e) => console.log(`       -> ${e.substring(0, 120)}`));
    }
  }

  console.log("=".repeat(60));
  console.log(`SCORE: ${wins}/3 in ${elapsed}s`);
  console.log(wins === 3 ? "ABSOLUTE VICTORY" : wins > 0 ? "PARTIAL VICTORY" : "DEFEAT");
  console.log("=".repeat(60));

  process.exit(wins === 3 ? 0 : 1);
}

main().catch(console.error);
