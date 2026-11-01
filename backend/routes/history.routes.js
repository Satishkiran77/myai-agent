const express = require("express");
const router = express.Router();
const conversationStore = require("../memory/conversation.store");
router.get("/history/:conversationId", (req, res) => {
    const id = req.params.conversationId;
    if (!id || id.length > 100) return res.status(400).json({ error: "Invalid conversation ID" });
    res.json({ messages: conversationStore.get(id) });
});
module.exports = router;
