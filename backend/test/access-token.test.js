const test = require("node:test");
const assert = require("node:assert/strict");
const { safeTokenMatch, requireAccessToken } = require("../middleware/access-token");

function createResponse() {
    return {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
}

test("matches only the exact configured token", () => {
    assert.equal(safeTokenMatch("secret-token", "secret-token"), true);
    assert.equal(safeTokenMatch("wrong-token", "secret-token"), false);
    assert.equal(safeTokenMatch(undefined, "secret-token"), false);
    assert.equal(safeTokenMatch("secret-token", ""), false);
});

test("rejects requests when no server token is configured", () => {
    const previous = process.env.BENZ_ACCESS_TOKEN;
    delete process.env.BENZ_ACCESS_TOKEN;
    delete require.cache[require.resolve("../config/settings")];
    delete require.cache[require.resolve("../middleware/access-token")];
    const middleware = require("../middleware/access-token").requireAccessToken;
    const res = createResponse();
    let nextCalled = false;

    middleware({ get: () => "anything" }, res, () => { nextCalled = true; });

    assert.equal(res.statusCode, 503);
    assert.equal(nextCalled, false);
    if (previous !== undefined) process.env.BENZ_ACCESS_TOKEN = previous;
    delete require.cache[require.resolve("../config/settings")];
    delete require.cache[require.resolve("../middleware/access-token")];
});

test("rejects missing or incorrect tokens and accepts the configured token", () => {
    const previous = process.env.BENZ_ACCESS_TOKEN;
    process.env.BENZ_ACCESS_TOKEN = "test-secret";
    delete require.cache[require.resolve("../config/settings")];
    delete require.cache[require.resolve("../middleware/access-token")];
    const middleware = require("../middleware/access-token").requireAccessToken;

    const missing = createResponse();
    middleware({ get: () => undefined }, missing, () => {});
    assert.equal(missing.statusCode, 401);

    const valid = createResponse();
    let nextCalled = false;
    middleware({ get: name => name === "X-BENZ-ACCESS-TOKEN" ? "test-secret" : undefined }, valid, () => { nextCalled = true; });
    assert.equal(valid.statusCode, 200);
    assert.equal(nextCalled, true);

    if (previous === undefined) delete process.env.BENZ_ACCESS_TOKEN;
    else process.env.BENZ_ACCESS_TOKEN = previous;
    delete require.cache[require.resolve("../config/settings")];
    delete require.cache[require.resolve("../middleware/access-token")];
});
