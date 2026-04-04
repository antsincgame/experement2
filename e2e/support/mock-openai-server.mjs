// Serves deterministic LM Studio-style responses on a dedicated test port so local E2E never collides with a real LM Studio instance.
import http from "node:http";

const PORT = Number(process.env.E2E_MOCK_LLM_PORT ?? 1235);

const ITERATION_RESPONSE = [
  "filepath: app/index.tsx\n",
  "<<<<<<< SEARCH\n",
  '      <Text testID="fixture-title">Hello from fixture</Text>\n',
  "=======\n",
  '      <Text testID="fixture-title">Hello from iteration</Text>\n',
  ">>>>>>> REPLACE\n",
];

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
        const chunks = systemPrompt.includes("expert code analyzer")
          ? ANALYZE_RESPONSE
          : ITERATION_RESPONSE;
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
