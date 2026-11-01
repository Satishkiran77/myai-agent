const express = require("express");
const router = express.Router();
router.get("/health", (req, res) => res.json({ status: "AI Agent is running" }));
module.exports = router;
