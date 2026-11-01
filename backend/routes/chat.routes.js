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
        let searchQuery = null;
        let reply;

        if (intent.intent === "web_search") {
            searchQuery = webSearchService.buildSearchQuery(userMessage);
            sources = await webSearchService.search(userMessage);
            if (!sources.length) {
                reply = "I couldn't find useful search results for that request. Try a more specific search phrase.";
            } else {
                const searchContext = [
                    "You are BENZ, an assistant that has just performed a live web search.",
                    "Answer the user's actual question using only the search result titles and snippets below.",
                    "Never claim you read or opened the linked pages; only snippets are available.",
                    "Do not invent news events, dates, facts, article details, or sources.",
                    "Do not recommend these websites as generic places to get news.",
                    "If a result is a topic page, homepage, or news aggregator rather than a specific article, say that clearly.",
                    "Summarize the specific information present in the snippets. If the snippets do not contain concrete news, be transparent and say the search did not return enough article-level detail.",
                    "Keep the answer concise. Do not create extra headlines that are not present in the result titles.",
                    "LIVE SEARCH QUERY: " + searchQuery,
                    "LIVE SEARCH RESULTS:",
                    ...sources.map((item, index) => (index + 1) + ". TITLE: " + item.title + "\nSNIPPET: " + item.snippet + "\nSOURCE URL: " + item.url)
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
        res.json({ reply, intent, searchQuery, sources });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
