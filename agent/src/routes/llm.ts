// Validates LLM route payloads so malformed prompts and URLs are rejected before proxying.
import { Router } from "express";
import { parseOrRespond } from "../lib/request-validation.js";
import { LlmEnhanceBodySchema } from "../schemas/runtime-input.schema.js";
import { handleLLMProxyRoute, completeNonStreaming } from "../services/llm-proxy.js";

const DEFAULT_LM_STUDIO_URL = process.env.LM_STUDIO_URL?.trim() || "http://localhost:1234";

export const llmRouter = Router();

llmRouter.post("/complete", (req, res) => {
  handleLLMProxyRoute(req, res).catch((err) => {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (!res.headersSent) {
      res.status(500).json({ error: message, code: "INTERNAL_ERROR" });
    }
  });
});

llmRouter.post("/enhance", async (req, res) => {
  const payload = parseOrRespond(LlmEnhanceBodySchema, req.body, res);
  if (!payload) {
    return;
  }

  try {
    const enhanced = await completeNonStreaming(
      [
        {
          role: "system",
          content: `You are a prompt engineering expert. The user will give you a short app description.
Your task: expand it into a detailed, specific prompt that will produce a better React Native (Expo) application.

Rules:
- Keep the core idea but add specific features, UI details, and tech choices
- Mention screens, navigation, components, colors, animations
- Be specific about data models and user flows
- Output ONLY the improved prompt text, no explanation
- Write in the same language as the input
- 3-5 sentences max`,
        },
        { role: "user", content: payload.prompt },
      ],
      {
        temperature: 0.7,
        maxTokens: 1024,
        model: payload.model,
        lmStudioUrl: payload.lmStudioUrl,
      }
    );
    res.json({ data: enhanced });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(502).json({ error: message });
  }
});

llmRouter.get("/health", async (_req, res) => {
  try {
    const response = await fetch(`${DEFAULT_LM_STUDIO_URL}/v1/models`);
    if (response.ok) {
      const data = await response.json();
      res.json({
        status: "connected",
        models: data.data?.map((model: { id: string }) => model.id) ?? [],
      });
    } else {
      res.json({ status: "error", message: "LM Studio returned error" });
    }
  } catch {
    res.json({ status: "disconnected", message: "LM Studio not reachable" });
  }
});
