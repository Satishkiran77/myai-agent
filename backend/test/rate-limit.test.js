const test = require("node:test");
const assert = require("node:assert/strict");
const { createRateLimiter } = require("../middleware/rate-limit");

function createResponse() {
    return {
        headers: {},
        statusCode: 200,
        body: null,
        setHeader(name, value) { this.headers[name] = value; return this; },
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
}

test("allows requests within the configured limit", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 2 });
    const res = createResponse();
    let nextCalls = 0;

    limiter({ ip: "127.0.0.1" }, res, () => { nextCalls += 1; });
    limiter({ ip: "127.0.0.1" }, res, () => { nextCalls += 1; });

    assert.equal(nextCalls, 2);
    assert.equal(res.headers["RateLimit-Remaining"], "0");
});

test("rejects requests after the limit and provides Retry-After", () => {
    const limiter = createRateLimiter({ windowMs: 10_000, maxRequests: 1, now: () => 1_000 });
    const req = { ip: "127.0.0.1" };
    const first = createResponse();
    const second = createResponse();
    let nextCalls = 0;

    limiter(req, first, () => { nextCalls += 1; });
    limiter(req, second, () => { nextCalls += 1; });

    assert.equal(nextCalls, 1);
    assert.equal(second.statusCode, 429);
    assert.equal(second.headers["Retry-After"], "10");
    assert.match(second.body.error, /too many requests/i);
});

test("tracks different client IP addresses independently", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 1 });
    const first = createResponse();
    const second = createResponse();

    limiter({ ip: "127.0.0.1" }, first, () => {});
    limiter({ ip: "127.0.0.2" }, second, () => {});

    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 200);
});

test("resets a client's counter after the time window", () => {
    let currentTime = 1_000;
    const limiter = createRateLimiter({
        windowMs: 1_000,
        maxRequests: 1,
        now: () => currentTime
    });
    const req = { ip: "127.0.0.1" };
    const first = createResponse();
    const blocked = createResponse();
    const afterWindow = createResponse();

    limiter(req, first, () => {});
    limiter(req, blocked, () => {});
    currentTime = 2_000;
    limiter(req, afterWindow, () => {});

    assert.equal(blocked.statusCode, 429);
    assert.equal(afterWindow.statusCode, 200);
});

test("rejects invalid limiter configuration", () => {
    assert.throws(() => createRateLimiter({ windowMs: 0 }), /positive numbers/);
    assert.throws(() => createRateLimiter({ maxRequests: 1.5 }), /positive numbers/);
});
