const crypto = require("crypto");
const settings = require("../config/settings");

function safeTokenMatch(provided, expected) {
    if (typeof provided !== "string" || !expected) return false;
    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(expected);
    return providedBuffer.length === expectedBuffer.length &&
        crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

function requireAccessToken(req, res, next) {
    if (!settings.accessToken) {
        return res.status(503).json({ error: "BENZ_ACCESS_TOKEN is not configured. Set it before starting the backend." });
    }
    const provided = req.get("X-BENZ-ACCESS-TOKEN");
    if (!safeTokenMatch(provided, settings.accessToken)) {
        return res.status(401).json({ error: "Access denied. Enter the BENZ access token and try again." });
    }
    next();
}

module.exports = { requireAccessToken, safeTokenMatch };
