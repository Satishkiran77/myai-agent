const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));

const conversations = new Map();

app.get("/api/health", (req, res) => {
    res.json({ status: "AI Agent is running" });
});

app.post("/api/chat", async (req, res) => {
    try {
        const { message, conversationId } = req.body;

        if (typeof message !== "string" || !message.trim() ||
            typeof conversationId !== "string" || !conversationId.trim()) {
            return res.status(400).json({
                error: "A message and conversation ID are required"
            });
        }

        const history = conversations.get(conversationId) || [];
        const messages = [
            ...history,
            { role: "user", content: message.trim() }
        ];

        const response = await fetch("http://localhost:11434/api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama3.2",
                messages,
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama returned status ${response.status}`);
        }

        const data = await response.json();
        const reply = data.message?.content;

        if (typeof reply !== "string") {
            throw new Error("Ollama returned an invalid response");
        }

        conversations.set(conversationId, [
            ...messages,
            { role: "assistant", content: reply }
        ].slice(-20));

        res.json({ reply });
    } catch (error) {
        console.error("Chat error:", error.message);
        res.status(500).json({
            error: "Ollama connection failed. Make sure Ollama is running."
        });
    }
});

app.listen(5000, () => {
    console.log("AI Agent running at http://localhost:5000");
});
