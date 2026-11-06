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
    allowedOrigins: (process.env.ALLOWED_ORIGINS ||
        "http://localhost:5000,http://127.0.0.1:5000,http://localhost:5500,http://127.0.0.1:5500,http://localhost:5501,http://127.0.0.1:5501,http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000")
        .split(",").map(origin => origin.trim()).filter(Boolean),
    maxConversationMessages: 20,
    maxMessageLength: 4000,
    accessToken: process.env.BENZ_ACCESS_TOKEN || ""
};
