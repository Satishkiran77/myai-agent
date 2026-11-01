function positiveNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
module.exports = {
    host: process.env.HOST || "127.0.0.1",
    port: positiveNumber(process.env.PORT, 5000),
    ollamaUrl: (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, ""),
    ollamaModel: process.env.OLLAMA_MODEL || "llama3.2",
    ollamaTimeoutMs: positiveNumber(process.env.OLLAMA_TIMEOUT_MS, 120000),
    jsonBodyLimit: process.env.JSON_BODY_LIMIT || "1mb",
    maxConversationMessages: 20,
    maxMessageLength: 4000
};
