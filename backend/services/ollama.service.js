const settings = require("../config/settings");
async function chat(messages) {
    let response;
    try {
        response = await fetch(settings.ollamaUrl + "/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: settings.ollamaModel, messages, stream: false }),
            signal: AbortSignal.timeout(settings.ollamaTimeoutMs)
        });
    } catch (error) {
        const issue = new Error(error.name === "TimeoutError" ? "The local AI model took too long to respond." : "Could not connect to Ollama. Check whether Ollama is running.");
        issue.status = 503;
        throw issue;
    }
    if (!response.ok) {
        const issue = new Error("Ollama returned status " + response.status);
        issue.status = 503;
        throw issue;
    }
    let data;
    try { data = await response.json(); }
    catch {
        const issue = new Error("Ollama returned an unreadable response.");
        issue.status = 502;
        throw issue;
    }
    if (typeof data.message?.content !== "string") {
        const issue = new Error("Ollama returned an invalid response.");
        issue.status = 502;
        throw issue;
    }
    return data.message.content;
}
module.exports = { chat };
