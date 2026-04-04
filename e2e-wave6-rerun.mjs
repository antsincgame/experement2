import WebSocket from "ws";

const WS_URL = "ws://localhost:3100";
const LM_STUDIO_URL = "http://localhost:1234";

const TEST_PROMPTS = [
  // Wave 6 re-run — failed tests from agent restart
  "Workout log with sets reps and weight",
  "Recipe app with ingredients and steps",
  "Drink water reminder with schedule",
  "Mood tracker with weekly chart",
  "Journal app with date and tags",
  "Symptom tracker with history log",
];

let passed = 0;
let failed = 0;
const results = [];

const runTest = (testIndex) => {
  return new Promise((resolve) => {
    const prompt = TEST_PROMPTS[testIndex];
    const testName = `Test ${testIndex + 1}/${TEST_PROMPTS.length}`;
    const startTime = Date.now();
    let planReceived = false;
    let filesGenerated = 0;
    let errorMsg = null;

    console.log(`\n${"=".repeat(60)}`);
    console.log(`${testName}: "${prompt}"`);
    console.log(`${"=".repeat(60)}`);

    const ws = new WebSocket(WS_URL);
    const timeout = setTimeout(() => {
      errorMsg = "TIMEOUT";
      ws.close();
    }, 180000);

    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "create_project", description: prompt, lmStudioUrl: LM_STUDIO_URL }));
    });

    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      switch (msg.type) {
        case "plan_complete":
          planReceived = true;
          console.log(`  ✅ Plan: ${msg.plan?.name} (${msg.plan?.files?.length ?? 0} files)`);
          break;
        case "file_complete":
          filesGenerated++;
          process.stdout.write(`  📄 ${filesGenerated} files\r`);
          break;
        case "generation_complete":
          console.log(`  ✅ Generated: ${msg.filesCount} files`);
          break;
        case "preview_ready":
          console.log(`  🚀 Preview: port ${msg.port}`);
          break;
        case "system_error":
          errorMsg = msg.error?.slice(0, 100);
          console.log(`  ❌ Error: ${errorMsg}`);
          break;
        case "project_created":
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`  ✅ Created: ${msg.projectName} in ${elapsed}s`);
          clearTimeout(timeout);
          ws.close();
          break;
      }
    });

    ws.on("close", () => {
      clearTimeout(timeout);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const success = planReceived && filesGenerated > 0 && !errorMsg;
      const result = { test: testIndex + 1, prompt: prompt.slice(0, 45), files: filesGenerated, time: elapsed, status: success ? "PASS" : "FAIL", error: errorMsg };
      results.push(result);
      if (success) { passed++; console.log(`  ✅ PASS (${elapsed}s, ${filesGenerated} files)`); }
      else { failed++; console.log(`  ❌ FAIL (${elapsed}s): ${errorMsg || "incomplete"}`); }
      resolve(result);
    });

    ws.on("error", (err) => { errorMsg = err.message; clearTimeout(timeout); ws.close(); });
  });
};

const main = async () => {
  console.log(`\n🏭 WAVE 6 RE-RUN (6 failed tests)`);
  for (let i = 0; i < TEST_PROMPTS.length; i++) {
    await runTest(i);
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.log(`\n${"=".repeat(60)}`);
  console.log(`WAVE 6 RE-RUN: ${passed} PASS / ${failed} FAIL / ${TEST_PROMPTS.length} TOTAL`);
  console.log(`${"=".repeat(60)}`);
  for (const r of results) console.log(`| ${r.test} | ${r.prompt}... | ${r.files} | ${r.time}s | ${r.status} |`);
  process.exit(failed > 0 ? 1 : 0);
};

main().catch(console.error);
