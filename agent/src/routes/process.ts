import { Router } from "express";
import {
  isRunning,
  getActivePort,
  killExpo,
} from "../services/process-manager.js";

export const processRouter = Router();

processRouter.get("/:name/status", (req, res) => {
  const { name } = req.params;
  const running = isRunning(name);
  const port = getActivePort(name);

  res.json({
    data: {
      running,
      port,
      previewUrl: port ? `/preview/` : null,
    },
  });
});

processRouter.post("/:name/kill", (req, res) => {
  const { name } = req.params;
  killExpo(name);
  res.json({ data: { message: "Process killed" } });
});
