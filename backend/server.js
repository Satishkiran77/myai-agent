const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs/promises");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));

const conversations = new Map();
const dataDirectory = path.join(__dirname, "data");
const memoryFile = path.join(dataDirectory, "conversations.json");

async function loadConversations() {
    await fs.mkdir(dataDirectory, { recursive: true });

    try {
        const savedData = await fs.readFile(memoryFile, "utf8");
        const savedConversations = JSON.parse(savedData);

        for (const [id, messages] of Object.entries(savedConversations)) {
            if (Array.isArray(messages)) {
                conversations.set(id, messages.slice(-20));
            }
        }

        console.log("Permanent memory loaded");
    } catch (error) {
        if (error.code !== "ENOENT") {
            throw error;
        }

        console.log("Starting with empty memory");
    }
}

async function saveConversations() {
    await fs.mkdir(dataDirectory, { recursive: true });

    const savedData = Object.fromEntries(conversations);
    const temporaryFile = memoryFile + ".tmp";

    await fs.writeFile(temporaryFile, JSON.stringify(savedData, null, 2), "utf8");
    await fs.rename(temporaryFile, memoryFile);
}

app.get("/api/health", (req, res) => {
    res.json({ status: "AI Agent is running" });
});

app.get("/api/history/:conversationId", (req, res) => {
    const conversationId = req.params.conversationId;

    if (!conversationId || conversationId.length > 100) {
        return res.status(400).json({ error: "Invalid conversation ID" });
    }

    res.json({
        messages: conversations.get(conversationId) || []
    });
});

app.post("/api/chat", async (req, res) => {
    try {
        const { message, conversationId } = req.body;

        if (typeof message !== "string" || !message.trim() ||
            typeof conversationId !== "string" || !conversationId.trim() ||
            conversationId.length > 100) {
            return res.status(400).json({
                error: "A valid message and conversation ID are required"
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
            throw new Error("Ollama returned status " + response.status);
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

        await saveConversations();

        res.json({ reply });
    } catch (error) {
        console.error("Chat error:", error.message);
        res.status(500).json({
            error: "Chat failed. Check whether Ollama is running and memory can be saved."
        });
    }
});

async function startServer() {
    try {
        await loadConversations();

        app.listen(5000, () => {
            console.log("AI Agent running at http://localhost:5000");
        });
    } catch (error) {
        console.error("Could not load permanent memory:", error.message);
        process.exit(1);
    }
}

startServer();
