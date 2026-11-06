function createRateLimiter(options = {}) {
    const windowMs = options.windowMs ?? 60_000;
    const maxRequests = options.maxRequests ?? 60;
    const now = options.now || Date.now;

    if (!Number.isFinite(windowMs) || windowMs <= 0 ||
        !Number.isInteger(maxRequests) || maxRequests <= 0) {
        throw new TypeError("Rate limiter windowMs and maxRequests must be positive numbers.");
    }

    const clients = new Map();

    return function rateLimit(req, res, next) {
        const currentTime = now();
        const clientKey = req.ip || req.socket?.remoteAddress || "unknown";

        for (const [key, entry] of clients) {
            if (currentTime - entry.startedAt >= windowMs) clients.delete(key);
        }

        let entry = clients.get(clientKey);
        if (!entry || currentTime - entry.startedAt >= windowMs) {
            entry = { startedAt: currentTime, count: 0 };
            clients.set(clientKey, entry);
        }

        if (entry.count >= maxRequests) {
            const retryAfter = Math.max(1, Math.ceil((entry.startedAt + windowMs - currentTime) / 1000));
            res.setHeader("Retry-After", String(retryAfter));
            return res.status(429).json({
                error: "Too many requests. Please try again later."
            });
        }

        entry.count += 1;
        res.setHeader("RateLimit-Limit", String(maxRequests));
        res.setHeader("RateLimit-Remaining", String(Math.max(0, maxRequests - entry.count)));
        return next();
    };
}

module.exports = { createRateLimiter };
