import WebSocket from "ws";

const WS_URL = "ws://localhost:3100";

const ws = new WebSocket(WS_URL);
const messages = [];
let startTime = Date.now();

const elapsed = () => `[${((Date.now() - startTime) / 1000).toFixed(1)}s]`;

ws.on("open", () => {
  console.log(`${elapsed()} ✅ Connected to Agent`);

  // Отправляем запрос на создание простого counter app
  const msg = {
    type: "create_project",
    description: "Simple counter app with increment and decrement buttons. One screen only.",
    lmStudioUrl: "http://localhost:1234",
  };

  console.log(`${elapsed()} 📤 Sending: create_project`);
  ws.send(JSON.stringify(msg));
});

ws.on("message", (data) => {
  const msg = JSON.parse(data.toString());
  messages.push(msg);

  switch (msg.type) {
    case "connected":
      console.log(`${elapsed()} 🔗 WS connected (clientId: ${msg.clientId?.slice(0, 8)})`);
      break;
    case "lm_studio_status":
      console.log(`${elapsed()} 🤖 LM Studio: ${msg.status}`);
      break;
    case "status":
      console.log(`${elapsed()} 📊 Status: ${msg.status}`);
      break;
    case "plan_chunk":
      process.stdout.write(".");
      break;
    case "plan_complete":
      console.log(`\n${elapsed()} ✅ Plan complete: ${msg.plan?.name} (${msg.plan?.files?.length} files)`);
      break;
    case "scaffold_complete":
      console.log(`${elapsed()} 📦 Scaffold: ${msg.projectName}`);
      break;
    case "file_generating":
      console.log(`${elapsed()} ⚙️  Generating: ${msg.filepath} (${Math.round(msg.progress * 100)}%)`);
      break;
    case "code_chunk":
      process.stdout.write("·");
      break;
    case "file_complete":
      console.log(`\n${elapsed()} ✅ File: ${msg.filepath}`);
      break;
    case "generation_complete":
      console.log(`${elapsed()} 🎉 Generation complete: ${msg.filesCount} files`);
      break;
    case "build_event":
      if (msg.eventType === "build_error") {
        console.log(`${elapsed()} ❌ Build error: ${msg.error?.slice(0, 100)}`);
      }
      break;
    case "preview_ready":
      console.log(`${elapsed()} 🚀 PREVIEW READY on port ${msg.port}`);
      console.log(`${elapsed()} 🌐 Open: http://localhost:3100/preview/`);
      printSummary();
      break;
    case "autofix_start":
      console.log(`${elapsed()} 🔧 Auto-fixing: ${msg.file}`);
      break;
    case "autofix_success":
      console.log(`${elapsed()} ✅ Auto-fix success (attempt ${msg.attempts})`);
      break;
    case "autofix_failed":
      console.log(`${elapsed()} ❌ Auto-fix failed after ${msg.attempts} attempts`);
      break;
    case "system_error":
      console.log(`${elapsed()} 💀 ERROR [${msg.step}]: ${msg.error}`);
      printSummary();
      break;
    case "project_created":
      console.log(`${elapsed()} ✅ Project created: ${msg.projectName}`);
      break;
    default:
      // silent
      break;
  }
});

ws.on("error", (err) => {
  console.error(`${elapsed()} ❌ WS Error:`, err.message);
});

ws.on("close", () => {
  console.log(`${elapsed()} 🔌 Disconnected`);
});

function printSummary() {
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("\n" + "=".repeat(60));
  console.log(`E2E TEST COMPLETE — ${totalTime}s`);
  console.log(`Messages received: ${messages.length}`);
  console.log(`Message types: ${[...new Set(messages.map(m => m.type))].join(", ")}`);
  console.log("=".repeat(60));

  setTimeout(() => process.exit(0), 2000);
}

// Timeout: 5 минут
setTimeout(() => {
  console.log(`\n${elapsed()} ⏰ TIMEOUT (5 min)`);
  printSummary();
}, 300000);
