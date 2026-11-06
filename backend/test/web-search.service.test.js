const test = require("node:test");
const assert = require("node:assert/strict");
const { selectDiverseResults } = require("../services/web-search.service");

test("limits search results to two per hostname", () => {
    const ranked = [
        { title: "Article one", snippet: "", url: "https://example.com/one" },
        { title: "Article two", snippet: "", url: "https://example.com/two" },
        { title: "Article three", snippet: "", url: "https://example.com/three" },
        { title: "Another source", snippet: "", url: "https://another.com/story" }
    ];

    const results = selectDiverseResults(ranked);

    assert.equal(results.length, 3);
    assert.equal(results.filter(result => new URL(result.url).hostname === "example.com").length, 2);
});

test("does not return more than the requested result limit", () => {
    const ranked = Array.from({ length: 15 }, (_, index) => ({
        title: `Article ${index}`,
        snippet: "",
        url: `https://source${index}.example/story`
    }));

    assert.equal(selectDiverseResults(ranked, [], 5).length, 5);
});

test("labels official and established news sources", () => {
    const ranked = [
        { title: "Official update", snippet: "", url: "https://openai.com/blog/update" },
        { title: "News report", snippet: "", url: "https://reuters.com/technology/report" }
    ];

    const results = selectDiverseResults(ranked);

    assert.deepEqual(results.map(result => result.sourceType), ["official", "established-news"]);
});
