const express = require("express");
const router = express.Router();
const profileStore = require("../memory/profile.store");
router.get("/memory", (req, res) => res.json({ memory: profileStore.getAll() }));
router.put("/memory/:key", async (req, res, next) => {
    try {
        const key = req.params.key.trim().toLowerCase();
        const value = typeof req.body?.value === "string" ? req.body.value.trim() : "";
        if (!key || key.length > 80 || ["__proto__", "constructor", "prototype"].includes(key) || !value || value.length > 200) {
            return res.status(400).json({ error: "Enter a valid memory key and value." });
        }
        await profileStore.set(key, value);
        res.json({ success: true, memory: profileStore.getAll() });
    } catch (error) { next(error); }
});
router.delete("/memory/:key", async (req, res, next) => {
    try {
        const key = req.params.key.trim().toLowerCase();
        if (!Object.prototype.hasOwnProperty.call(profileStore.getAll(), key)) return res.status(404).json({ error: "Memory not found." });
        await profileStore.remove(key);
        res.json({ success: true, memory: profileStore.getAll() });
    } catch (error) { next(error); }
});
module.exports = router;
