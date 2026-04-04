// E2E Batch Test Runner — generates projects via WebSocket and checks results
import WebSocket from "ws";
import fs from "fs";
import path from "path";

const AGENT_WS = "ws://localhost:3100";
const WORKSPACE = path.resolve("../workspace");
const RESULTS_FILE = path.resolve("../tools/e2e-results.json");

const PROMPTS = [
  "Grocery checklist app",
  "Water intake tracker",
  "Breathing exercise timer",
  "Flashcard maker for students",
  "Simple expense log",
  "Daily step counter display",
  "Temperature converter",
  "Age calculator from birthday",
  "Random number generator",
  "Simple voting poll app",
];

const results = [];

async function generateProject(prompt, index) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const ws = new WebSocket(AGENT_WS);
    let projectName = null;
    let status = "connecting";
    let filesCount = 0;
    let errors = [];
    let timeout;

    // 8 minute timeout per project (LLM + Metro build)
    timeout = setTimeout(() => {
      status = "timeout";
      ws.close();
      resolve({ index: index + 1, prompt, projectName, status, filesCount, errors, duration: Date.now() - startTime });
    }, 480000);

    ws.on("open", () => {
      status = "planning";
      ws.send(JSON.stringify({
        type: "create_project",
        description: prompt,
        lmStudioUrl: "http://localhost:11434",
        model: "qwen3-coder-next-q2_k_l",
        maxTokens: 65536,
      }));
    });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());

        switch (msg.type) {
          case "status":
            status = msg.status;
            break;
          case "scaffold_complete":
            projectName = msg.projectName;
            break;
          case "generation_complete":
            filesCount = msg.filesCount || 0;
            break;
          case "preview_ready":
            status = "ready";
            clearTimeout(timeout);
            ws.close();
            resolve({
              index: index + 1,
              prompt,
              projectName,
              status: "success",
              filesCount,
              errors,
              port: msg.port,
              duration: Date.now() - startTime,
            });
            break;
          case "system_error":
            errors.push(msg.error?.slice(0, 200) || "unknown");
            break;
          case "project_created":
            projectName = msg.projectName;
            break;
        }
      } catch { /* ignore parse errors */ }
    });

    ws.on("error", (err) => {
      errors.push(`WS error: ${err.message}`);
    });

    ws.on("close", () => {
      if (status !== "success" && status !== "timeout") {
        clearTimeout(timeout);
        resolve({
          index: index + 1,
          prompt,
          projectName,
          status: status === "ready" ? "success" : `stopped_at_${status}`,
          filesCount,
          errors,
          duration: Date.now() - startTime,
        });
      }
    });
  });
}

async function checkProjectFiles(projectName) {
  if (!projectName) return { hasLayout: false, hasIndex: false, fileCount: 0 };

  const projectPath = path.join(WORKSPACE, projectName);
  const hasLayout = fs.existsSync(path.join(projectPath, "app/_layout.tsx"));
  const hasIndex = fs.existsSync(path.join(projectPath, "app/(tabs)/index.tsx"));

  let fileCount = 0;
  try {
    const appFiles = fs.readdirSync(path.join(projectPath, "app"), { recursive: true });
    const srcFiles = fs.existsSync(path.join(projectPath, "src"))
      ? fs.readdirSync(path.join(projectPath, "src"), { recursive: true })
      : [];
    fileCount = [...appFiles, ...srcFiles].filter(f => f.toString().endsWith(".ts") || f.toString().endsWith(".tsx")).length;
  } catch { /* ignore */ }

  // Check if layout uses Stack (not Slot)
  let usesStack = false;
  try {
    const layout = fs.readFileSync(path.join(projectPath, "app/_layout.tsx"), "utf-8");
    usesStack = layout.includes("Stack");
  } catch { /* ignore */ }

  return { hasLayout, hasIndex, fileCount, usesStack };
}

async function main() {
  console.log(`🧪 Starting E2E batch test: ${PROMPTS.length} projects`);
  console.log(`📂 Workspace: ${WORKSPACE}`);
  console.log("");

  for (let i = 0; i < PROMPTS.length; i++) {
    const prompt = PROMPTS[i];
    console.log(`\n[${i + 1}/${PROMPTS.length}] "${prompt.slice(0, 50)}..."`);
    console.log("  ⏳ Generating...");

    const result = await generateProject(prompt, i);
    const files = await checkProjectFiles(result.projectName);

    result.files = files;

    const icon = result.status === "success" ? "✅" : result.status === "timeout" ? "⏰" : "❌";
    console.log(`  ${icon} ${result.status} | ${result.projectName || "no-name"} | ${files.fileCount} files | ${Math.round(result.duration / 1000)}s`);

    if (result.errors.length > 0) {
      console.log(`  ⚠️  Errors: ${result.errors[0].slice(0, 100)}`);
    }

    if (!files.usesStack && files.hasLayout) {
      console.log(`  🔴 WARNING: Layout does NOT use <Stack>!`);
    }

    results.push(result);
  }

  // Summary
  console.log("\n\n" + "=".repeat(60));
  console.log("📊 E2E BATCH TEST RESULTS");
  console.log("=".repeat(60));

  const success = results.filter(r => r.status === "success").length;
  const timeout = results.filter(r => r.status === "timeout").length;
  const failed = results.filter(r => !["success", "timeout"].includes(r.status)).length;

  console.log(`✅ Success: ${success}/${results.length}`);
  console.log(`⏰ Timeout: ${timeout}/${results.length}`);
  console.log(`❌ Failed:  ${failed}/${results.length}`);
  console.log(`📈 Success Rate: ${Math.round(success / results.length * 100)}%`);

  const avgDuration = Math.round(results.filter(r => r.status === "success").reduce((s, r) => s + r.duration, 0) / Math.max(success, 1) / 1000);
  console.log(`⏱️  Avg Duration: ${avgDuration}s`);

  const withStack = results.filter(r => r.files?.usesStack).length;
  console.log(`🏗️  Stack Layout: ${withStack}/${results.length}`);

  if (failed > 0) {
    console.log("\n❌ Failed projects:");
    results.filter(r => !["success", "timeout"].includes(r.status)).forEach(r => {
      console.log(`  - [${r.index}] ${r.projectName || "unknown"}: ${r.status} | ${r.errors[0]?.slice(0, 100) || "no error"}`);
    });
  }

  // Save results
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
  console.log(`\n💾 Results saved to: ${RESULTS_FILE}`);
}

main().catch(console.error);
