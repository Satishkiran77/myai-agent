const test = require("node:test");
const assert = require("node:assert/strict");
const { understandIntent } = require("../agent/intent.engine");

test("recognizes latest web searches", () => {
    assert.equal(understandIntent("Search the latest AI news about OpenAI").intent, "web_search");
});

test("recognizes explicit memory instructions", () => {
    assert.equal(understandIntent("Remember this: my favorite color is blue").intent, "memory");
});

test("marks file actions as approval-required", () => {
    const result = understandIntent("Open the file report.txt");
    assert.equal(result.intent, "file_action");
    assert.equal(result.requiresApproval, true);
});

test("marks computer actions as approval-required", () => {
    const result = understandIntent("Open Chrome");
    assert.equal(result.intent, "computer_action");
    assert.equal(result.requiresApproval, true);
});

test("recognizes coding requests", () => {
    assert.equal(understandIntent("Debug this code").intent, "coding");
});

test("falls back to general chat for ordinary questions", () => {
    assert.equal(understandIntent("Explain photosynthesis simply").intent, "general_chat");
});

test("rejects empty or invalid input safely", () => {
    assert.deepEqual(understandIntent("   "), { intent: "unknown", confidence: 0 });
    assert.deepEqual(understandIntent(null), { intent: "unknown", confidence: 0 });
});
