const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));

app.get("/api/health", (req, res) => {
    res.json({ status: "AI Agent is running" });
});

app.post("/api/chat", async (req, res) => {
    try {
        const message = req.body.message;

        const response = await fetch("http://localhost:11434/api/generate", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama3.2",
                prompt: message,
                stream: false
            })
        });

        const data = await response.json();

        res.json({ reply: data.response });

    } catch (error) {
        res.status(500).json({ error: "Ollama connection failed" });
    }
});

app.listen(5000, () => {
    console.log("AI Agent running at http://localhost:5000");
});