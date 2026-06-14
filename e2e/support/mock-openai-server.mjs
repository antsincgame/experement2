// Serves deterministic LM Studio-style responses on a dedicated test port so local E2E never collides with a real LM Studio instance.
import http from "node:http";

const PORT = Number(process.env.E2E_MOCK_LLM_PORT ?? 1235);

const ITERATION_TITLE = "Hello from iteration";
const ITERATION2_TITLE = "Hello from iteration 2";

const nextTitleFor = (currentTitle) => {
  if (currentTitle === "Hello from fixture") return ITERATION_TITLE;
  if (currentTitle === ITERATION_TITLE) return ITERATION2_TITLE;
  return ITERATION_TITLE;
};

// The edit step embeds the live file under "Target files:" (agent editor.ts). Anchor the
// SEARCH on whatever title the file currently holds so repeated iterations keep applying:
// a fixed "Hello from fixture" SEARCH fails ("Search block not found") once the first edit
// already renamed it.
const buildIterationChunks = (messages) => {
  const userText = (messages ?? [])
    .filter((message) => message && message.role === "user")
    .map((message) => (typeof message.content === "string" ? message.content : ""))
    .join("\n");
  const markerIndex = userText.lastIndexOf("Target files:");
  const fileSection = markerIndex >= 0 ? userText.slice(markerIndex) : userText;
  const match = fileSection.match(/<Text testID="fixture-title">([^<]*)<\/Text>/);
  const currentTitle = match ? match[1] : "Hello from fixture";
  const replaceTitle = nextTitleFor(currentTitle);
  return [
    "filepath: app/index.tsx\n",
    "<<<<<<< SEARCH\n",
    `      <Text testID="fixture-title">${currentTitle}</Text>\n`,
    "=======\n",
    `      <Text testID="fixture-title">${replaceTitle}</Text>\n`,
    ">>>>>>> REPLACE\n",
  ];
};

const ANALYZE_RESPONSE = [
  "{",
  '"thinking":"Update the existing preview title text in app/index.tsx.",',
  '"action":"read_files",',
  '"files":["app/index.tsx"],',
  '"newFiles":[],',
  '"filesToDelete":[],',
  '"newDependencies":[]',
  "}",
];

// Minimal valid plan so create_project requests aren't mis-served the iteration
// diff (which would fail JSON parsing and surface a confusing plan error).
const PLAN_RESPONSE = [
  '{"name":"e2e-plan-app","displayName":"E2E Plan App",',
  '"description":"A deterministic single-screen app for E2E.",',
  '"files":[{"path":"app/index.tsx","type":"screen",',
  '"description":"Single home screen rendering a title and a counter.","dependencies":[]}],',
  '"extraDependencies":[],',
  '"theme":{"style":"premium","background":"#F8FAFC","surface":"#FFFFFF",',
  '"primary":"#6366F1","primaryText":"#0F172A","secondaryText":"#64748B",',
  '"accent":"#6366F1","cardRadius":20,"buttonRadius":28,"isDark":false},',
  '"navigation":{"type":"stack","screens":[{"path":"app/index.tsx","name":"Home","icon":"home"}]}}',
];

const readJsonBody = (request) =>
  new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk.toString();
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });

const writeJson = (response, statusCode, payload) => {
  response.writeHead(statusCode, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
};

const writeSse = async (response, chunks) => {
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  for (const chunk of chunks) {
    response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`);
    await new Promise((resolve) => setTimeout(resolve, 40));
  }

  response.write("data: [DONE]\n\n");
  response.end();
};

const server = http.createServer(async (request, response) => {
  if (!request.url) {
    writeJson(response, 404, { error: "Missing URL" });
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    writeJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && request.url === "/v1/models") {
    writeJson(response, 200, {
      data: [{ id: "mock-qwen3-coder", object: "model" }],
    });
    return;
  }

  if (request.method === "POST" && request.url === "/v1/chat/completions") {
    try {
      const body = await readJsonBody(request);
      if (body.stream) {
        const systemPrompt = body.messages?.[0]?.content ?? "";
        let chunks;
        if (systemPrompt.includes("application architect")) {
          chunks = PLAN_RESPONSE;
        } else if (systemPrompt.includes("expert code analyzer")) {
          chunks = ANALYZE_RESPONSE;
        } else {
          chunks = buildIterationChunks(body.messages);
        }
        await writeSse(response, chunks);
        return;
      }

      writeJson(response, 200, {
        choices: [{ message: { content: "Mock completion" } }],
      });
      return;
    } catch (error) {
      writeJson(response, 400, {
        error: error instanceof Error ? error.message : "Invalid request body",
      });
      return;
    }
  }

  writeJson(response, 404, { error: `Unhandled route: ${request.method} ${request.url}` });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[mock-openai] listening on http://127.0.0.1:${PORT}`);
});
