// Validates LLM route payloads so malformed prompts and URLs are rejected before proxying.
import { Router } from "express";
import { parseOrRespond } from "../lib/request-validation.js";
import { LlmEnhanceBodySchema } from "../schemas/runtime-input.schema.js";
import { handleLLMProxyRoute, completeNonStreaming, getActiveRequestCount } from "../services/llm-proxy.js";

const DEFAULT_LM_STUDIO_URL = process.env.LM_STUDIO_URL?.trim() || "http://localhost:1234";

// Cache models list to avoid hammering LM Studio during generation
let modelsCache: { data: unknown; timestamp: number } | null = null;
const MODELS_CACHE_TTL_MS = 10_000;

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
          content: `You are a prompt engineering expert for a specialized React Native app generator. The user will give you a short app description.
Your task: expand it into a detailed, specific prompt that will produce a better React Native (Expo) application.

CRITICAL ARCHITECTURE RULES (DO NOT SUGGEST ANYTHING ELSE):
- UI Framework: STRICTLY Tamagui v2 (no Material, no NativeWind, no Neumorphism).
- State Management: Zustand.
- Icons: @expo/vector-icons/Feather.
- Routing: Expo Router (file-based).

Rules:
- Keep the core idea but add specific features, screens, and component structures using Tamagui.
- Mention specific Tamagui layouts (XStack, YStack) or Themes (light/dark/cyberpunk).
- Be specific about data models and user flows.
- Output ONLY the improved prompt text, no explanation.
- Write in the same language as the input.
- 3-5 sentences max.`,
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

llmRouter.get("/models", async (req, res) => {
  const baseUrl = typeof req.query.url === "string" && req.query.url.trim()
    ? req.query.url.trim().replace(/\/+$/, "")
    : DEFAULT_LM_STUDIO_URL;

  // Return cached result during active generation to avoid hammering LM Studio
  if (
    getActiveRequestCount() > 0 &&
    modelsCache &&
    Date.now() - modelsCache.timestamp < MODELS_CACHE_TTL_MS
  ) {
    res.json(modelsCache.data);
    return;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    const response = await fetch(`${baseUrl}/v1/models`, { signal: controller.signal });
    clearTimeout(timer);

    if (!response.ok) {
      const result = { data: { models: [], status: "error", error: `HTTP ${response.status}` } };
      res.json(result);
      return;
    }

    const json = await response.json();
    const models = Array.isArray(json.data) ? json.data : [];
    const result = { data: { models, status: "connected" } };
    modelsCache = { data: result, timestamp: Date.now() };
    res.json(result);
  } catch (err) {
    const result = {
      data: {
        models: [],
        status: "disconnected",
        error: err instanceof Error ? err.message : "Connection failed",
      },
    };
    res.json(result);
  }
});
