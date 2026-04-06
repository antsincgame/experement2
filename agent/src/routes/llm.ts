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
          content: `You are an elite Product Architect and UX Visionary for a specialized React Native app generator.
The user will give you a short app idea. Your task is to expand it into a rich, tactile, and highly professional product specification.

CRITICAL TECH STACK (DO NOT SUGGEST ANYTHING ELSE):
- UI Framework: STRICTLY Tamagui v2 (NO Material, NO NativeWind).
- State Management: Zustand.
- Icons: @expo/vector-icons/Feather.
- Routing: Expo Router (file-based).

THE TAMAGUI V2 ARSENAL (Weave 3-5 of these into your specification to make it premium):
1. Advanced Layouts: YStack/XStack/ZStack with separator={<Separator />}. Use <ThemeInverse> or theme="alt1" for contrasting highlighted sections.
2. Tactile Interactivity: Specify the use of pseudo-props like pressStyle={{ scale: 0.97 }}, hoverStyle, and focusStyle for highly responsive buttons and cards.
3. Rich Components: Propose using advanced inputs like ToggleGroup, Slider, Progress, Select (dropdowns), Tabs, and Accordion.
4. Overlays & Drawers: Suggest bottom Sheet with snap points for filters/menus, Dialog for modals, and Toast for success/error feedback.
5. Fluid Motion: Mandate Moti-like declarative animations using animation="bouncy" (or "lazy"/"quick") combined with enterStyle={{ opacity: 0, y: 10 }} and exitStyle for smooth mount/unmount transitions.
6. Haptics: Combine Tamagui interactions with expo-haptics for physical feedback.

YOUR INSTRUCTIONS:
1. Expand the user's idea with specific features, screens, and data flows.
2. Explicitly dictate the use of specific Tamagui Arsenal features mentioned above to guarantee a world-class UI/UX.
3. Output ONLY the improved prompt text. No explanations, no markdown code blocks, no preamble.
4. Write in the EXACT SAME LANGUAGE as the user's input.
5. Keep it punchy, dense, and visionary: 4-6 sentences max.`,
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
