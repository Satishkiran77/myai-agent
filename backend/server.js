const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs/promises");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));

const conversations = new Map();
const profileMemory = {};
const dataDirectory = path.join(__dirname, "data");
const memoryFile = path.join(dataDirectory, "conversations.json");
const profileFile = path.join(dataDirectory, "profile.json");

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

        console.log("Conversation history loaded");
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
        console.log("Starting with empty conversation history");
    }

    try {
        const savedProfile = await fs.readFile(profileFile, "utf8");
        Object.assign(profileMemory, JSON.parse(savedProfile));
        console.log("Global personal memory loaded");
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
        console.log("Starting with empty personal memory");
    }
}

async function saveConversations() {
    await fs.mkdir(dataDirectory, { recursive: true });
    const temporaryFile = memoryFile + ".tmp";

    await fs.writeFile(
        temporaryFile,
        JSON.stringify(Object.fromEntries(conversations), null, 2),
        "utf8"
    );
    await fs.rename(temporaryFile, memoryFile);
}

async function saveProfileMemory() {
    await fs.mkdir(dataDirectory, { recursive: true });
    const temporaryFile = profileFile + ".tmp";

    await fs.writeFile(
        temporaryFile,
        JSON.stringify(profileMemory, null, 2),
        "utf8"
    );
    await fs.rename(temporaryFile, profileFile);
}

function rememberUserFact(message) {
    const match = message.match(/^remember(?: this)?\s*:\s*(?:my\s+)?(.+?)\s+is\s+(.+)$/i);

    if (!match) return false;

    const key = match[1].trim().toLowerCase();
    const value = match[2].trim().replace(/[.!?]+$/, "");

    if (!key || !value) return false;

    profileMemory[key] = value;
    return true;
}

function rememberAutomaticPreference(message) {
    const cleanMessage = message.trim().replace(/[.!?]+$/, "");

    // Avoid automatically storing sensitive personal information.
    const sensitiveTerms = /\b(password|passcode|otp|medical|health|disease|diagnosis|medicine|religion|politics|political party|caste|sexual|bank account|credit card|aadhaar|passport)\b/i;
    if (sensitiveTerms.test(cleanMessage)) return false;

    let match = cleanMessage.match(/^my favorite ([a-z0-9 _-]{2,40}) is (.{1,100})$/i);
    if (match) {
        profileMemory["favorite " + match[1].trim().toLowerCase()] = match[2].trim();
        return true;
    }

    match = cleanMessage.match(/^i (?:like|love|enjoy) (.{2,100})$/i);
    if (match) {
        profileMemory["likes"] = match[1].trim();
        return true;
    }

    match = cleanMessage.match(/^i prefer (.{2,100})$/i);
    if (match) {
        profileMemory["preference"] = match[1].trim();
        return true;
    }

    match = cleanMessage.match(/^i am interested in (.{2,100})$/i);
    if (match) {
        profileMemory["interests"] = match[1].trim();
        return true;
    }

    return false;
}

function createMemoryPrompt() {
    const facts = Object.entries(profileMemory);

    if (facts.length === 0) return null;

    const memoryText = facts
        .map(([key, value]) => "- " + key + ": " + value)
        .join("\n");

    return "You are the user's personal AI assistant. These are saved facts about the user. Use them when relevant and answer directly. Do not say you have no memory when the answer is listed here.\n" + memoryText;
}

app.get("/api/health", (req, res) => {
    res.json({ status: "AI Agent is running" });
});

app.get("/api/memory", (req, res) => {
    res.json({ memory: profileMemory });
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

        const userMessage = message.trim();

        const explicitlyRemembered = rememberUserFact(userMessage);
        const automaticallyRemembered = !explicitlyRemembered &&
            rememberAutomaticPreference(userMessage);

        if (explicitlyRemembered || automaticallyRemembered) {
            await saveProfileMemory();
        }

        const history = conversations.get(conversationId) || [];
        const messages = [
            ...history,
            { role: "user", content: userMessage }
        ];

        const memoryPrompt = createMemoryPrompt();
        const ollamaMessages = memoryPrompt
            ? [{ role: "system", content: memoryPrompt }, ...messages]
            : messages;

        const response = await fetch("http://localhost:11434/api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama3.2",
                messages: ollamaMessages,
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
        console.error("Could not load memory:", error.message);
        process.exit(1);
    }
}

startServer();
