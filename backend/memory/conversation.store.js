const fs = require("fs/promises");
const path = require("path");
const settings = require("../config/settings");
const dataDirectory = path.join(__dirname, "../data");
const dataFile = path.join(dataDirectory, "conversations.json");
const conversations = new Map();
let saveQueue = Promise.resolve();

async function writeAtomically(filePath, content) {
    await fs.mkdir(dataDirectory, { recursive: true });
    const temporaryFile = filePath + ".tmp";
    await fs.writeFile(temporaryFile, content, "utf8");
    await fs.rename(temporaryFile, filePath);
}
async function load() {
    await fs.mkdir(dataDirectory, { recursive: true });
    try {
        const saved = JSON.parse(await fs.readFile(dataFile, "utf8"));
        for (const [id, messages] of Object.entries(saved)) {
            if (Array.isArray(messages)) conversations.set(id, messages.slice(-settings.maxConversationMessages));
        }
        console.log("Conversation history loaded.");
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
        console.log("Starting with empty conversation history.");
    }
}
function get(id) { return conversations.get(id) || []; }
async function set(id, messages) {
    conversations.set(id, messages.slice(-settings.maxConversationMessages));
    saveQueue = saveQueue.catch(() => {}).then(() => writeAtomically(dataFile, JSON.stringify(Object.fromEntries(conversations), null, 2)));
    await saveQueue;
}
module.exports = { load, get, set };
