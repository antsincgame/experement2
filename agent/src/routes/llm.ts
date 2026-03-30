import { Router } from "express";
import { handleLLMProxyRoute } from "../services/llm-proxy.js";

export const llmRouter = Router();

llmRouter.post("/complete", (req, res) => {
  handleLLMProxyRoute(req, res).catch((err) => {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (!res.headersSent) {
      res.status(500).json({ error: message, code: "INTERNAL_ERROR" });
    }
  });
});

llmRouter.get("/health", async (_req, res) => {
  try {
    const response = await fetch("http://localhost:1234/v1/models");
    if (response.ok) {
      const data = await response.json();
      res.json({
        status: "connected",
        models: data.data?.map((m: { id: string }) => m.id) ?? [],
      });
    } else {
      res.json({ status: "error", message: "LM Studio returned error" });
    }
  } catch {
    res.json({ status: "disconnected", message: "LM Studio not reachable" });
  }
});
