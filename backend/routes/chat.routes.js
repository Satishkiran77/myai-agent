const express = require("express");
const router = express.Router();
const settings = require("../config/settings");
const conversationStore = require("../memory/conversation.store");
const profileStore = require("../memory/profile.store");
const ollamaService = require("../services/ollama.service");
router.post("/chat", async (req, res, next) => {
    try {
        const { message, conversationId } = req.body || {};
        if (typeof message !== "string" || !message.trim() || message.length > settings.maxMessageLength ||
            typeof conversationId !== "string" || !conversationId.trim() || conversationId.length > 100) {
            return res.status(400).json({ error: "A valid message (up to " + settings.maxMessageLength + " characters) and conversation ID are required." });
        }
        const userMessage = message.trim();
        let remembered = profileStore.rememberUserFact(userMessage);
        if (!remembered) remembered = profileStore.rememberAutomaticPreference(userMessage);
        if (remembered) await profileStore.set(remembered.key, remembered.value);
        const messages = [...conversationStore.get(conversationId), { role: "user", content: userMessage }];
        const memoryPrompt = profileStore.createMemoryPrompt();
        const modelMessages = memoryPrompt ? [{ role: "system", content: memoryPrompt }, ...messages] : messages;
        const reply = await ollamaService.chat(modelMessages);
        await conversationStore.set(conversationId, [...messages, { role: "assistant", content: reply }]);
        res.json({ reply });
    } catch (error) { next(error); }
});
module.exports = router;
