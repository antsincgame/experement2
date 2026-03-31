const DEFAULT_LM_STUDIO_URL = "http://localhost:1234";
const activeControllers = new Map();
export const streamCompletion = async (messages, options = {}) => {
    const baseUrl = options.lmStudioUrl ?? DEFAULT_LM_STUDIO_URL;
    const controller = new AbortController();
    const taskId = options.taskId ?? crypto.randomUUID();
    activeControllers.set(taskId, controller);
    const body = {
        messages,
        temperature: options.temperature ?? 0.4,
        max_tokens: options.maxTokens ?? 32768,
        stream: true,
        model: options.model ?? "",
    };
    if (options.responseFormat) {
        body.response_format = options.responseFormat;
    }
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
    });
    if (!response.ok) {
        activeControllers.delete(taskId);
        const errorText = await response.text();
        throw new Error(`LM Studio error (${response.status}): ${errorText}`);
    }
    if (!response.body) {
        activeControllers.delete(taskId);
        throw new Error("LM Studio returned no body");
    }
    async function* parseSSE() {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith("data: "))
                        continue;
                    const data = trimmed.slice(6);
                    if (data === "[DONE]")
                        return;
                    try {
                        const parsed = JSON.parse(data);
                        const content = parsed.choices?.[0]?.delta?.content;
                        if (content)
                            yield content;
                    }
                    catch {
                        // частичный JSON — пропускаем
                    }
                }
            }
        }
        finally {
            reader.releaseLock();
            activeControllers.delete(taskId);
        }
    }
    return parseSSE();
};
export const completeNonStreaming = async (messages, options = {}) => {
    const baseUrl = options.lmStudioUrl ?? DEFAULT_LM_STUDIO_URL;
    const body = {
        messages,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 32768,
        stream: false,
        model: options.model ?? "",
    };
    if (options.responseFormat) {
        body.response_format = options.responseFormat;
    }
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LM Studio error (${response.status}): ${errorText}`);
    }
    const json = await response.json();
    return json.choices?.[0]?.message?.content ?? "";
};
export const abortTask = (taskId) => {
    const controller = activeControllers.get(taskId);
    if (!controller)
        return false;
    controller.abort();
    activeControllers.delete(taskId);
    return true;
};
export const abortAll = () => {
    let count = 0;
    for (const [id, controller] of activeControllers) {
        controller.abort();
        activeControllers.delete(id);
        count++;
    }
    return count;
};
export const handleLLMProxyRoute = async (req, res) => {
    const { messages, temperature, max_tokens, stream, response_format, model } = req.body;
    if (!messages?.length) {
        res.status(400).json({ error: "messages required", code: "INVALID_INPUT" });
        return;
    }
    if (stream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        try {
            const generator = await streamCompletion(messages, {
                temperature,
                maxTokens: max_tokens,
                responseFormat: response_format,
                model,
            });
            for await (const chunk of generator) {
                res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
            }
            res.write("data: [DONE]\n\n");
            res.end();
        }
        catch (err) {
            const message = err instanceof Error ? err.message : "Unknown error";
            res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
            res.end();
        }
    }
    else {
        try {
            const result = await completeNonStreaming(messages, {
                temperature,
                maxTokens: max_tokens,
                responseFormat: response_format,
                model,
            });
            res.json({ data: result });
        }
        catch (err) {
            const message = err instanceof Error ? err.message : "Unknown error";
            res.status(502).json({ error: message, code: "LLM_ERROR" });
        }
    }
};
//# sourceMappingURL=llm-proxy.js.map