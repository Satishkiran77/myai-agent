const express = require("express");
const router = express.Router();
const settings = require("../config/settings");
const conversationStore = require("../memory/conversation.store");
const profileStore = require("../memory/profile.store");
const ollamaService = require("../services/ollama.service");
const webSearchService = require("../services/web-search.service");
const articleFetchService = require("../services/article-fetch.service");
const { understandIntent } = require("../agent/intent.engine");

function isSameNewsEvent(firstTitle, secondTitle) {
    const stopWords = new Set(["a", "an", "and", "the", "of", "for", "to", "in", "on", "with", "new", "latest", "announces", "announcing", "introduces", "introducing", "launches", "unveils"]);
    const tokens = title => new Set(
        String(title || "").toLowerCase()
            .replace(/[^a-z0-9 ]/g, " ")
            .split(/\s+/)
            .filter(word => word.length > 2 && !stopWords.has(word))
    );
    const first = tokens(firstTitle);
    const second = tokens(secondTitle);
    if (!first.size || !second.size) return false;
    const shared = [...first].filter(word => second.has(word)).length;
    const union = new Set([...first, ...second]).size;
    return shared >= 2 && shared / union >= 0.22;
}

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
            const isFreshSearch = /\b(news|latest|today|breaking|recent)\b/i.test(searchQuery);
            // Search providers can return different results between requests. If a
            // fresh-news batch contains no date-eligible articles, retry once before
            // reporting that no useful results were found.
            for (let attempt = 0; attempt < 2; attempt++) {
                const candidates = await webSearchService.search(userMessage);
                const eligible = await articleFetchService.enrichArticles(
                    candidates,
                    isFreshSearch ? { maxAgeDays: 30 } : {}
                );
                // A targeted query is only a lead. Keep its company attribution
                // when the fetched article itself supports that company.
                const supported = eligible.filter(item => {
                    if (!item.matchedCompany) return true;
                    const company = item.matchedCompany.toLowerCase();
                    const domain = (() => {
                        try { return new URL(item.url).hostname.toLowerCase(); }
                        catch { return ""; }
                    })();
                    // Use headline and search description for company relevance.
                    // A company mentioned only deep in another company's article is not news coverage.
                    const normalizedText = " " + [item.title, item.snippet]
                        .join(" ").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + " ";
                    const aliases = company === "openai" ? ["openai", "chatgpt", "gpt"] :
                        company === "google" ? ["google", "deepmind", "gemini", "genie"] :
                        company === "microsoft" ? ["microsoft", "copilot", "azure ai"] : [company];
                    const mentioned = aliases.some(alias => normalizedText.includes(" " + alias + " "));
                    const officialDomain = company === "openai" ? domain === "openai.com" || domain.endsWith(".openai.com") :
                        company === "google" ? ["blog.google", "deepmind.google", "googleblog.com"].some(host => domain === host || domain.endsWith("." + host)) :
                        company === "microsoft" ? domain === "microsoft.com" || domain.endsWith(".microsoft.com") : false;
                    return mentioned || officialDomain;
                });
                const uniqueEligible = new Map();
                for (const item of supported) {
                    let key = item.url;
                    try {
                        const parsed = new URL(item.url);
                        parsed.hash = "";
                        for (const name of [...parsed.searchParams.keys()]) {
                            if (/^(utm_|fbclid$|gclid$|ref$)/i.test(name)) parsed.searchParams.delete(name);
                        }
                        key = parsed.href.replace(/\/$/, "");
                    } catch {}
                    if (!uniqueEligible.has(key)) uniqueEligible.set(key, item);
                }
                const deduplicated = [...uniqueEligible.values()];
                if (deduplicated.length) {
                    sources = deduplicated;
                    break;
                }
                if (!isFreshSearch || attempt === 1) sources = eligible;
            }
            const independentDomains = new Set(sources.map(item => {
                try { return new URL(item.url).hostname.toLowerCase().replace(/^www\./, ""); }
                catch { return ""; }
            }).filter(Boolean));
            if (!sources.length) {
                reply = "I couldn't find useful, date-eligible search results for that request. Future-dated or generic pages were excluded. Try a more specific search phrase.";
            } else {
                const searchContext = [
                    "You are BENZ, an assistant that has just performed a live web search.",
                    "Answer the user's actual question using only the search result titles, snippets, and extracted article content below.",
                    "Prefer sources marked official for company announcements and primary research. Use established-news sources as independent confirmation where available. Treat other sources as lower-confidence leads, not authoritative confirmation.",
                    "Do not treat a search-result ranking page, model directory, daily briefing, or aggregator as proof of a specific announcement. If such a page remains, identify it as a secondary roundup and seek specific underlying articles in the supplied sources.",
                    "For latest-news searches, only dated articles from the last 30 days and from official or established-news domains are eligible. Undated, older, future-dated, and aggregator results are excluded. Do not fill gaps with remembered or guessed news.",
                    "Do not present a list of unrelated events as one confirmed story. Group each event with the sources that specifically support it.",
                    "Create at most one news item per supplied source article. Each item must describe the main event announced or reported by that article, not a different event merely mentioned in its background, citations, or historical context.",
                    "Never turn a reference to an earlier report, past incident, older model, or prior announcement inside an article into a separate latest-news headline. A referenced event is context only unless a separate supplied source has that event as its own main subject.",
                    "Keep each headline faithful to the supplied source title. Do not add a headline or standalone news item unless one supplied source is specifically about that event.",
                    "Compare the independent sources. State whether a claim appears in multiple sources or only one; do not call a claim corroborated unless at least two different source domains support it.",
                    "If fewer than two useful independent sources are available, clearly say the research is limited rather than presenting it as a broad consensus.",
                    "Treat publication dates as important evidence. Mention the date when provided, and do not describe an older article as breaking or current news.",
                    "Some pages may block access or expose only a short description. Never claim full article access unless extracted article content is provided.",
                    "Do not invent news events, dates, facts, article details, or sources. If the supplied sources do not support a specific model name, release, price, benchmark, or company claim, do not mention it.",
                    "Do not recommend these websites as generic places to get news.",
                    "If a result is a topic page, homepage, or news aggregator rather than a specific article, say that clearly.",
                    "Prioritize extracted article content when available. If only a snippet is available, clearly say that the page could not provide full article text. Never invent missing details.",
                    "Keep the answer concise. Do not create extra headlines that are not present in the result titles.",
                    "RESEARCH COVERAGE: " + independentDomains.size + " distinct source domains. " + (independentDomains.size < 2 ? "Coverage is limited; do not imply independent corroboration." : "Check each claim against the specific sources that support it."),
                    "LIVE SEARCH QUERY: " + searchQuery,
                    "LIVE SEARCH RESULTS:",
                    ...sources.map((item, index) => (index + 1) + ". SOURCE TYPE: " + (item.sourceType || "other") + "\nTITLE: " + item.title + "\nPUBLISHED: " + (item.publishedAt || "Not provided") + "\nDATE EVIDENCE: " + (item.dateSource || "Unavailable") + "\nDESCRIPTION: " + item.snippet + "\nARTICLE CONTENT: " + (item.articleContent || "Not available; use description only.") + "\nSOURCE URL: " + item.url)
                ].join("\n\n");
                // Keep one system message for local models that handle multiple system
                // messages inconsistently. Preserve profile memory in the same instruction.
                const combinedSystemPrompt = [searchContext, memoryPrompt].filter(Boolean).join("\n\n");
                if (isFreshSearch) {
                    // For latest-news requests, do not ask a generative model to
                    // invent or combine headlines. Build the response only from
                    // the dated source titles and search-provider descriptions.
                    const newsItems = sources.filter((item, index) =>
                        !sources.slice(0, index).some(previous => isSameNewsEvent(previous.title, item.title))
                    );
                    reply = "Recent AI news coverage found (published within the last 30 days):\n\n" +
                        newsItems.map((item, index) => {
                            const date = item.publishedAt ? new Date(item.publishedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "Date unavailable";
                            const description = String(item.snippet || "").replace(/\\s+/g, " ").trim();
                            return (index + 1) + ". " + item.title + "\n" +
                                "Date: " + date + "\n" +
                                (description ? description.slice(0, 360) : "The source page did not provide a short description.") +
                                "\nSource: " + item.url;
                        }).join("\n\n") +
                        "\n\nThese are source-based headlines and descriptions, not independently verified conclusions. Open the source cards to read the articles.";
                } else {
                    reply = await ollamaService.chat([
                        { role: "system", content: combinedSystemPrompt },
                        ...messages
                    ]);
                }
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
