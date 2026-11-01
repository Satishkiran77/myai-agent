const fs = require("fs/promises");
const path = require("path");
const dataDirectory = path.join(__dirname, "../data");
const dataFile = path.join(dataDirectory, "profile.json");
const profileMemory = Object.create(null);
let saveQueue = Promise.resolve();

async function persist() {
    await fs.mkdir(dataDirectory, { recursive: true });
    const temporaryFile = dataFile + ".tmp";
    await fs.writeFile(temporaryFile, JSON.stringify(profileMemory, null, 2), "utf8");
    await fs.rename(temporaryFile, dataFile);
}
async function load() {
    await fs.mkdir(dataDirectory, { recursive: true });
    try {
        const saved = JSON.parse(await fs.readFile(dataFile, "utf8"));
        if (saved && typeof saved === "object" && !Array.isArray(saved)) {
            for (const [key, value] of Object.entries(saved)) if (typeof value === "string" && !["__proto__", "constructor", "prototype"].includes(key)) profileMemory[key] = value;
        }
        console.log("Global personal memory loaded.");
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
        console.log("Starting with empty personal memory.");
    }
}
function getAll() { return { ...profileMemory }; }
function createMemoryPrompt() {
    const facts = Object.entries(profileMemory);
    if (!facts.length) return null;
    const memoryText = facts.map(([key, value]) => "- " + key + ": " + value).join("\n");
    return "You are the user's personal AI assistant. These are saved facts about the user. Use them when relevant and answer directly. Do not say you have no memory when the answer is listed here.\n" + memoryText;
}
async function set(key, value) {
    profileMemory[key] = value;
    saveQueue = saveQueue.catch(() => {}).then(persist);
    await saveQueue;
}
async function remove(key) {
    delete profileMemory[key];
    saveQueue = saveQueue.catch(() => {}).then(persist);
    await saveQueue;
}
function rememberUserFact(message) {
    const match = message.match(/^remember(?: this)?\s*:\s*(?:my\s+)?(.+?)\s+is\s+(.+)$/i);
    if (!match) return null;
    const key = match[1].trim().toLowerCase();
    const value = match[2].trim().replace(/[.!?]+$/, "");
    const sensitive = /\b(password|passcode|otp|medical|health|disease|diagnosis|medicine|religion|politics|political party|caste|sexual|bank account|credit card|aadhaar|passport)\b/i;
    if (sensitive.test(key + " " + value)) return null;
    if (!key || !value || key.length > 80 || value.length > 200 || ["__proto__", "constructor", "prototype"].includes(key)) return null;
    return { key, value };
}
function rememberAutomaticPreference(message) {
    const clean = message.trim().replace(/[.!?]+$/, "");
    const sensitive = /\b(password|passcode|otp|medical|health|disease|diagnosis|medicine|religion|politics|political party|caste|sexual|bank account|credit card|aadhaar|passport)\b/i;
    if (sensitive.test(clean)) return null;
    let match = clean.match(/^my favorite ([a-z0-9 _-]{2,40}) is (.{1,100})$/i);
    if (match) return { key: "favorite " + match[1].trim().toLowerCase(), value: match[2].trim() };
    match = clean.match(/^i (?:like|love|enjoy) (.{2,100})$/i);
    if (match) return { key: "likes", value: match[1].trim() };
    match = clean.match(/^i prefer (.{2,100})$/i);
    if (match) return { key: "preference", value: match[1].trim() };
    match = clean.match(/^i am interested in (.{2,100})$/i);
    if (match) return { key: "interests", value: match[1].trim() };
    return null;
}
module.exports = { load, getAll, set, remove, createMemoryPrompt, rememberUserFact, rememberAutomaticPreference };
