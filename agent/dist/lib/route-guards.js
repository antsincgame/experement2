export const DANGEROUS_ACTION_HEADER = "x-app-factory-confirm";
export const DELETE_WORKSPACE_CONFIRMATION = "delete-workspace";
export const KILL_PROCESS_CONFIRMATION = "kill-preview-process";
const DANGEROUS_ROUTES_ENABLED = process.env.ALLOW_DANGEROUS_PROJECT_OPERATIONS !== "false";
const readConfirmationHeader = (req) => {
    const headerValue = req.headers[DANGEROUS_ACTION_HEADER];
    if (Array.isArray(headerValue)) {
        return headerValue[0] ?? null;
    }
    return typeof headerValue === "string" ? headerValue : null;
};
export const requireDangerousAction = (req, res, confirmationValue, actionLabel) => {
    if (!DANGEROUS_ROUTES_ENABLED) {
        res.status(403).json({
            error: `${actionLabel} is disabled by server configuration`,
            code: "OPERATION_DISABLED",
        });
        return false;
    }
    if (readConfirmationHeader(req) !== confirmationValue) {
        res.status(403).json({
            error: `${actionLabel} requires explicit confirmation`,
            code: "CONFIRMATION_REQUIRED",
        });
        return false;
    }
    return true;
};
//# sourceMappingURL=route-guards.js.map