// Validates process route params so preview process control cannot target invalid projects.
import { Router } from "express";
import { parseOrRespond } from "../lib/request-validation.js";
import { ProjectParamsSchema } from "../schemas/runtime-input.schema.js";
import { isRunning, getActivePort, killExpo, } from "../services/process-manager.js";
import { projectExists } from "../services/file-manager.js";
export const processRouter = Router();
processRouter.get("/:name/status", (req, res) => {
    const params = parseOrRespond(ProjectParamsSchema, req.params, res);
    if (!params) {
        return;
    }
    if (!projectExists(params.name)) {
        res.status(404).json({ error: "Project not found", code: "NOT_FOUND" });
        return;
    }
    const running = isRunning(params.name);
    const port = getActivePort(params.name);
    res.json({
        data: {
            running,
            port,
            previewUrl: port ? "/preview/" : null,
        },
    });
});
processRouter.post("/:name/kill", (req, res) => {
    const params = parseOrRespond(ProjectParamsSchema, req.params, res);
    if (!params) {
        return;
    }
    if (!projectExists(params.name)) {
        res.status(404).json({ error: "Project not found", code: "NOT_FOUND" });
        return;
    }
    killExpo(params.name);
    res.json({ data: { message: "Process killed" } });
});
//# sourceMappingURL=process.js.map