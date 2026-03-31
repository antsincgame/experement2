import WebSocket from "ws";

const WS_URL = "ws://localhost:3100";
const LM_STUDIO_URL = "http://localhost:1234";

const TEST_PROMPTS = [
  // Wave 7 — tools & utilities
  "QR code generator with text input",
  "Stopwatch with lap times",
  "Alarm clock with multiple alarms",
  "Loan calculator with monthly payments",
  "Tip calculator with custom percentage",
  "Time zone converter for multiple cities",
  "Text case converter upper lower title",
  "Word and character counter for text",
  "Percentage calculator with formula",
  "Roman numeral converter bidirectional",
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
    let previewReady = false;
    let errorMsg = null;

    console.log(`\n${"=".repeat(60)}`);
    console.log(`${testName}: "${prompt.slice(0, 55)}"`);
    console.log(`${"=".repeat(60)}`);

    const ws = new WebSocket(WS_URL);
    const timeout = setTimeout(() => {
      console.log(`  ⏰ TIMEOUT after 180s`);
      errorMsg = "TIMEOUT";
      ws.close();
    }, 180000);

    ws.on("open", () => {
      ws.send(JSON.stringify({
        type: "create_project",
        description: prompt,
        lmStudioUrl: LM_STUDIO_URL,
      }));
    });

    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());

      switch (msg.type) {
        case "plan_complete":
          planReceived = true;
          const fileCount = msg.plan?.files?.length ?? 0;
          console.log(`  ✅ Plan: ${msg.plan?.name} (${fileCount} files)`);
          break;
        case "file_complete":
          filesGenerated++;
          process.stdout.write(`  📄 ${filesGenerated} files generated\r`);
          break;
        case "generation_complete":
          console.log(`  ✅ Generated: ${msg.filesCount} files`);
          break;
        case "preview_ready":
          previewReady = true;
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

      const result = {
        test: testIndex + 1,
        prompt: prompt.slice(0, 45),
        plan: planReceived,
        files: filesGenerated,
        preview: previewReady,
        error: errorMsg,
        time: elapsed,
        status: success ? "PASS" : "FAIL",
      };
      results.push(result);

      if (success) {
        passed++;
        console.log(`  ✅ PASS (${elapsed}s, ${filesGenerated} files)`);
      } else {
        failed++;
        console.log(`  ❌ FAIL (${elapsed}s): ${errorMsg || "incomplete"}`);
      }

      resolve(result);
    });

    ws.on("error", (err) => {
      errorMsg = err.message;
      clearTimeout(timeout);
      ws.close();
    });
  });
};

const main = async () => {
  console.log(`\n🏭 APP FACTORY E2E — WAVE 7`);
  console.log(`Tests: ${TEST_PROMPTS.length}`);
  console.log(`LM Studio: ${LM_STUDIO_URL}`);
  console.log(`Agent: ${WS_URL}\n`);

  for (let i = 0; i < TEST_PROMPTS.length; i++) {
    await runTest(i);
    await new Promise((r) => setTimeout(r, 5000));
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`WAVE 7 RESULTS: ${passed} PASS / ${failed} FAIL / ${TEST_PROMPTS.length} TOTAL`);
  console.log(`${"=".repeat(60)}`);
  console.log("\n| # | Prompt | Files | Time | Status |");
  console.log("|---|--------|-------|------|--------|");
  for (const r of results) {
    console.log(`| ${r.test} | ${r.prompt}... | ${r.files} | ${r.time}s | ${r.status} |`);
  }
  console.log("");

  if (failed > 0) {
    console.log("FAILURES:");
    for (const r of results.filter((r) => r.status === "FAIL")) {
      console.log(`  Test ${r.test}: ${r.error || "incomplete generation"}`);
    }
  }

  process.exit(failed > 0 ? 1 : 0);
};

main().catch(console.error);
