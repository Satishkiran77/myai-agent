const express = require("express");
const cors = require("cors");
const { createRateLimiter } = require("./middleware/rate-limit");
const path = require("path");
const settings = require("./config/settings");
const healthRoutes = require("./routes/health.routes");
const chatRoutes = require("./routes/chat.routes");
const memoryRoutes = require("./routes/memory.routes");
const historyRoutes = require("./routes/history.routes");
const { loadStores } = require("./memory");
const { requireAccessToken } = require("./middleware/access-token");

const app = express();
app.disable("x-powered-by");

const allowedOrigins = new Set(settings.allowedOrigins);
app.use(cors({
    origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin)) return callback(null, true);
        return callback(null, false);
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "X-BENZ-ACCESS-TOKEN"],
    maxAge: 600
}));

app.use(express.json({ limit: settings.jsonBodyLimit }));
app.use("/api", createRateLimiter({ windowMs: 60_000, maxRequests: 120 }));
app.use("/api", requireAccessToken);
app.use("/api/chat", createRateLimiter({ windowMs: 60_000, maxRequests: 12 }));
app.use("/api/memory", createRateLimiter({ windowMs: 60_000, maxRequests: 30 }));
app.use(express.static(path.join(__dirname, "../frontend")));
app.use("/api", healthRoutes);
app.use("/api", chatRoutes);
app.use("/api", memoryRoutes);
app.use("/api", historyRoutes);

app.use((req, res) => res.status(404).json({ error: "Route not found." }));
app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = [413, 502, 503].includes(error.status) ? error.status : 500;
    console.error("Request error:", error.message);
    res.status(status).json({ error: status === 413 ? "Request is too large." : status === 503 ? "Ollama is unavailable or took too long. Check whether Ollama is running." : status === 502 ? "Ollama returned an invalid response." : "Something went wrong. Please try again." });
});

async function startServer() {
    try {
        await loadStores();
        const server = app.listen(settings.port, settings.host, () => {
            console.log("BENZ backend is running at http://localhost:" + settings.port);
            console.log("AI model: " + settings.ollamaModel);
        });
        const shutdown = signal => {
            console.log(signal + " received. Closing BENZ backend...");
            server.close(() => process.exit(0));
        };
        process.once("SIGINT", () => shutdown("SIGINT"));
        process.once("SIGTERM", () => shutdown("SIGTERM"));
        return server;
    } catch (error) {
        console.error("BENZ could not start:", error.message);
        process.exitCode = 1;
    }
}
if (require.main === module) startServer();
module.exports = { app, startServer };
