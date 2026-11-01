const express = require("express");
const router = express.Router();
const settings = require("../config/settings");
const conversationStore = require("../memory/conversation.store");
const profileStore = require("../memory/profile.store");
const ollamaService = require("../services/ollama.service");
const webSearchService = require("../services/web-search.service");
const { understandIntent } = require("../agent/intent.engine");

router.post("/chat", async (req, res, next) => {
    try {
        const { message, conversationId } = req.body || {};
        if (typeof message !== "string" || !message.trim() || message.length > settings.maxMessageLength ||
            typeof conversationId !== "string" || !conversationId.trim() || conversationId.length > 100) {
            return res.status(400).json({ error: "A valid message (up to " + settings.maxMessageLength + " characters) and conversation ID are required." });
        }

        const userMessage = message.trim();
        const intent = understandIntent(userMessage);

        let remembered = profileStore.rememberUserFact(userMessage);
        if (!remembered) remembered = profileStore.rememberAutomaticPreference(userMessage);
        if (remembered) await profileStore.set(remembered.key, remembered.value);

        const messages = [...conversationStore.get(conversationId), { role: "user", content: userMessage }];
        const memoryPrompt = profileStore.createMemoryPrompt();
        const modelMessages = memoryPrompt ? [{ role: "system", content: memoryPrompt }, ...messages] : messages;
        let sources = [];
        let reply;

        if (intent.intent === "web_search") {
            sources = await webSearchService.search(userMessage);
            if (!sources.length) {
                reply = "I couldn't find reliable search results for that request. Try rephrasing your search.";
            } else {
                const searchContext = [
                    "You are BENZ. Answer the user's request using only the web search results below.",
                    "Do not invent facts, dates, headlines, or sources. If the results do not answer something, say so.",
                    "Summarize the results clearly and mention that the links are the sources.",
                    "WEB SEARCH RESULTS:",
                    ...sources.map((item, index) => (index + 1) + ". " + item.title + "\n" + item.snippet + "\nURL: " + item.url)
                ].join("\n\n");
                reply = await ollamaService.chat([
                    { role: "system", content: searchContext },
                    ...modelMessages
                ]);
            }
        } else {
            reply = await ollamaService.chat(modelMessages);
        }

        await conversationStore.set(conversationId, [...messages, { role: "assistant", content: reply }]);
        res.json({ reply, intent, sources });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
