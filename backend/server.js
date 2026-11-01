const express = require("express");
const cors = require("cors");
const path = require("path");
const settings = require("./config/settings");
const healthRoutes = require("./routes/health.routes");
const chatRoutes = require("./routes/chat.routes");
const memoryRoutes = require("./routes/memory.routes");
const historyRoutes = require("./routes/history.routes");
const { loadStores } = require("./memory");

const app = express();
app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: settings.jsonBodyLimit }));
app.use(express.static(path.join(__dirname, "../frontend")));
app.use("/api", healthRoutes);
app.use("/api", chatRoutes);
app.use("/api", memoryRoutes);
app.use("/api", historyRoutes);

app.use((req, res) => res.status(404).json({ error: "Route not found." }));
app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status === 413 ? 413 : 500;
    console.error("Request error:", error.message);
    res.status(status).json({ error: status === 413 ? "Request is too large." : "Something went wrong. Please try again." });
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
