export const formatZodError = (error) => error.issues
    .map((issue) => {
    const location = issue.path.length > 0
        ? issue.path.join(".")
        : "request";
    return `${location}: ${issue.message}`;
})
    .join("; ");
export const respondInvalidInput = (res, error) => {
    res.status(400).json({
        error: formatZodError(error),
        code: "INVALID_INPUT",
    });
};
export const parseOrRespond = (schema, input, res) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
        respondInvalidInput(res, parsed.error);
        return null;
    }
    return parsed.data;
};
//# sourceMappingURL=request-validation.js.map