import WebSocket from "ws";

const WS_URL = "ws://localhost:3100";
const LM_STUDIO_URL = "http://localhost:1234";

const TEST_PROMPTS = [
  "Simple counter with plus and minus buttons",
  "Color picker with hex display",
  "Tip calculator with percentage slider",
  "BMI calculator with height and weight inputs",
  "Stopwatch with start stop and reset",
  "Random quote generator with copy button",
  "Temperature converter celsius to fahrenheit",
  "Age calculator from birthdate",
  "Password generator with length slider",
  "Coin flip with heads or tails result",
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
    let buildSuccess = false;
    let buildError = null;
    let autofixAttempts = 0;
    let autofixSuccess = false;
    let errorMsg = null;
    let projectName = null;
    let previewPort = null;

    console.log(`\n${"=".repeat(60)}`);
    console.log(`${testName}: "${prompt}"`);
    console.log(`${"=".repeat(60)}`);

    const ws = new WebSocket(WS_URL);
    const timeout = setTimeout(() => {
      console.log(`  ⏰ TIMEOUT after 240s`);
      errorMsg = "TIMEOUT";
      ws.close();
    }, 240000); // 4 min (includes build time)

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
          console.log(`  ✅ Plan: ${msg.plan?.name} (${msg.plan?.files?.length ?? 0} files)`);
          break;
        case "file_complete":
          filesGenerated++;
          break;
        case "generation_complete":
          console.log(`  ✅ Generated: ${msg.filesCount} files`);
          break;
        case "build_event":
          if (msg.eventType === "build_success") {
            buildSuccess = true;
            console.log(`  ✅ Build SUCCESS`);
          }
          if (msg.eventType === "build_error") {
            buildError = msg.error?.slice(0, 120);
            console.log(`  ⚠️  Build error: ${buildError?.slice(0, 80)}`);
          }
          break;
        case "autofix_start":
          autofixAttempts++;
          console.log(`  🔧 Auto-fix #${autofixAttempts}: ${msg.error?.slice(0, 60)}`);
          break;
        case "autofix_success":
          autofixSuccess = true;
          console.log(`  ✅ Auto-fix SUCCESS (${msg.attempts} attempts)`);
          break;
        case "autofix_failed":
          console.log(`  ❌ Auto-fix FAILED after ${msg.attempts} attempts`);
          break;
        case "preview_ready":
          previewReady = true;
          previewPort = msg.port;
          console.log(`  🚀 Preview: port ${msg.port}`);
          break;
        case "system_error":
          errorMsg = msg.error?.slice(0, 150);
          console.log(`  ❌ Error: ${errorMsg}`);
          break;
        case "project_created":
          projectName = msg.projectName;
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`  ✅ Created: ${projectName} in ${elapsed}s`);
          clearTimeout(timeout);

          // Wait 5s then check if preview actually works
          setTimeout(async () => {
            let previewWorks = false;
            if (previewPort) {
              try {
                const resp = await fetch(`http://localhost:3100/preview/`);
                const html = await resp.text();
                previewWorks = resp.ok && !html.includes("_expo-static-error") && !html.includes("Unable to resolve");
                if (!previewWorks && html.includes("_expo-static-error")) {
                  // Extract error from Metro error page
                  const errorMatch = html.match(/"content":"([^"]+)"/);
                  buildError = errorMatch ? errorMatch[1].slice(0, 100) : "Metro error page";
                  console.log(`  ❌ Preview has Metro error: ${buildError?.slice(0, 80)}`);
                } else if (previewWorks) {
                  console.log(`  ✅ Preview HTML verified!`);
                }
              } catch {
                console.log(`  ⚠️  Preview fetch failed`);
              }
            }

            ws.close();

            const finalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            const success = planReceived && filesGenerated > 0 && previewReady && !errorMsg;
            const previewOk = previewWorks;

            const result = {
              test: testIndex + 1,
              prompt: prompt.slice(0, 40),
              plan: planReceived,
              files: filesGenerated,
              buildOk: buildSuccess && !buildError,
              autofix: autofixAttempts > 0 ? (autofixSuccess ? "fixed" : "failed") : "none",
              preview: previewReady,
              previewOk,
              error: errorMsg || buildError || null,
              time: finalElapsed,
              status: success && previewOk ? "PASS" : success ? "PARTIAL" : "FAIL",
            };
            results.push(result);

            if (result.status === "PASS") {
              passed++;
              console.log(`  ✅ PASS — full preview working! (${finalElapsed}s)`);
            } else if (result.status === "PARTIAL") {
              console.log(`  🟡 PARTIAL — generated but preview has errors (${finalElapsed}s)`);
            } else {
              failed++;
              console.log(`  ❌ FAIL (${finalElapsed}s): ${result.error || "incomplete"}`);
            }

            resolve(result);
          }, 5000);
          return; // Don't close WS yet
      }
    });

    ws.on("close", () => {
      clearTimeout(timeout);
      // If we haven't resolved yet (no project_created), resolve as fail
      if (!results.find(r => r.test === testIndex + 1)) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const result = {
          test: testIndex + 1,
          prompt: prompt.slice(0, 40),
          plan: planReceived,
          files: filesGenerated,
          buildOk: false,
          autofix: "none",
          preview: false,
          previewOk: false,
          error: errorMsg || "connection closed",
          time: elapsed,
          status: "FAIL",
        };
        results.push(result);
        failed++;
        console.log(`  ❌ FAIL (${elapsed}s): ${result.error}`);
        resolve(result);
      }
    });

    ws.on("error", (err) => {
      errorMsg = err.message;
      clearTimeout(timeout);
      ws.close();
    });
  });
};

const main = async () => {
  console.log(`\n🏭 APP FACTORY — FULL E2E PREVIEW TEST`);
  console.log(`Tests: ${TEST_PROMPTS.length}`);
  console.log(`Checking: plan → generate → build → autofix → preview verify\n`);

  for (let i = 0; i < TEST_PROMPTS.length; i++) {
    await runTest(i);
    await new Promise((r) => setTimeout(r, 3000));
  }

  // Summary
  const partial = results.filter(r => r.status === "PARTIAL").length;
  console.log(`\n${"=".repeat(60)}`);
  console.log(`RESULTS: ${passed} PASS / ${partial} PARTIAL / ${failed} FAIL / ${TEST_PROMPTS.length} TOTAL`);
  console.log(`${"=".repeat(60)}`);
  console.log("\n| # | Prompt | Files | Build | AutoFix | Preview | Status |");
  console.log("|---|--------|-------|-------|---------|---------|--------|");
  for (const r of results) {
    console.log(`| ${r.test} | ${r.prompt}... | ${r.files} | ${r.buildOk ? "✅" : "❌"} | ${r.autofix} | ${r.previewOk ? "✅" : "❌"} | ${r.status} |`);
  }

  if (results.some(r => r.error)) {
    console.log("\nERRORS:");
    for (const r of results.filter(r => r.error)) {
      console.log(`  Test ${r.test}: ${r.error}`);
    }
  }

  console.log("");
  process.exit(failed > 0 ? 1 : 0);
};

main().catch(console.error);
