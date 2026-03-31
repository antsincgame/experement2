import { Router } from "express";
import { handleLLMProxyRoute, completeNonStreaming } from "../services/llm-proxy.js";
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
    const { prompt, model, lmStudioUrl } = req.body;
    if (!prompt) {
        res.status(400).json({ error: "prompt required" });
        return;
    }
    try {
        const enhanced = await completeNonStreaming([
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
            { role: "user", content: prompt },
        ], {
            temperature: 0.7,
            maxTokens: 1024,
            model: model || undefined,
            lmStudioUrl: lmStudioUrl || undefined,
        });
        res.json({ data: enhanced });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        res.status(502).json({ error: message });
    }
});
llmRouter.get("/health", async (_req, res) => {
    try {
        const response = await fetch("http://localhost:1234/v1/models");
        if (response.ok) {
            const data = await response.json();
            res.json({
                status: "connected",
                models: data.data?.map((m) => m.id) ?? [],
            });
        }
        else {
            res.json({ status: "error", message: "LM Studio returned error" });
        }
    }
    catch {
        res.json({ status: "disconnected", message: "LM Studio not reachable" });
    }
});
//# sourceMappingURL=llm.js.map