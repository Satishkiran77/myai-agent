const conversationStore = require("./conversation.store");
const profileStore = require("./profile.store");
async function loadStores() {
    await Promise.all([conversationStore.load(), profileStore.load()]);
}
module.exports = { loadStores, conversationStore, profileStore };
