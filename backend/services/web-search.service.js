function decodeHtml(value) {
    return value
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&#x27;/gi, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
        .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function cleanText(value) {
    return decodeHtml(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function decodeRedirect(url) {
    try {
        const parsed = new URL(url, "https://html.duckduckgo.com");
        const target = parsed.searchParams.get("uddg");
        return target ? decodeURIComponent(target) : parsed.href;
    } catch {
        return url;
    }
}

function buildSearchQuery(message) {
    return message
        .trim()
        .replace(/^(please\s+)?(search|look\s+up|find\s+online|browse\s+for)\s+/i, "")
        .replace(/\s+(please|for\s+me)$/i, "")
        .replace(/[?!.]+$/g, "")
        .trim();
}

function normalizeUrl(value) {
    try {
        const url = new URL(value);
        url.hash = "";
        for (const key of [...url.searchParams.keys()]) {
            if (/^(utm_|fbclid$|gclid$|ref$)/i.test(key)) url.searchParams.delete(key);
        }
        return url.href.replace(/\/$/, "");
    } catch {
        return value;
    }
}

function isGenericPage(result) {
    try {
        const url = new URL(result.url);
        const path = url.pathname.toLowerCase().replace(/\/$/, "");
        const title = result.title.toLowerCase();
        const genericPath = /\/(category|categories|tag|tags|topic|topics|search|latest|news|research|artificial-intelligence|ai-news)(\/|\.html|$)/.test(path);
        const homepage = !path || path === "/index.html" || path === "/news.html";
        const genericTitle = /\b(latest|daily|news|updates|recap|roundup|digest|newsletter|artificial intelligence|ai)\b/.test(title) &&
            !/\b(announces?|launches?|released?|unveils?|raises?|acquires?|develops?|introduces?|reports?|researchers?|study|model|chip|funding|deal|breakthrough)\b/.test(title);
        const genericSnippet = /latest (?:ai )?news|daily ai news|news recap|news roundup|news digest|read the latest|stay updated|browse thousands|news and analysis from|summari[sz]ed in minutes/i.test(result.snippet);
        return genericPath || homepage || (genericTitle && genericSnippet);
    } catch {
        return true;
    }
}

function scoreResult(result) {
    let score = 0;
    const text = result.title + " " + result.snippet;
    if (/\b(announces?|launches?|released?|unveils?|raises?|acquires?|develops?|introduces?|reports?|researchers?|study|model|chip|funding|deal|breakthrough)\b/i.test(result.title)) score += 4;
    if (/\b(202[5-9]|today|yesterday|hours ago|days ago|october|november|december)\b/i.test(text)) score += 2;
    if (/\b(according to|said|research|company|researchers|announced|launched)\b/i.test(result.snippet)) score += 1;
    if (/\/(20\d{2})\//.test(result.url)) score += 1;
    if (/\b(official|press release|study|paper|report)\b/i.test(text)) score += 1;
    return score;
}

async function searchProvider(query) {
    const url = "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query);
    const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; BENZAssistant/1.0)" },
        signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error("Search provider returned status " + response.status + ".");

    const html = await response.text();
    const found = [];
    const pattern = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<(?:a|div)[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div)>/gi;
    let match;
    while ((match = pattern.exec(html)) && found.length < 12) {
        const result = {
            title: cleanText(match[2]),
            snippet: cleanText(match[3]),
            url: decodeRedirect(decodeHtml(match[1]))
        };
        if (result.title && result.snippet && /^https?:\/\//i.test(result.url)) found.push(result);
    }
    return found;
}

async function search(query) {
    const cleanQuery = buildSearchQuery(query);
    if (!cleanQuery) {
        const error = new Error("Please provide a topic to search for.");
        error.status = 400;
        throw error;
    }

    const isFreshTopic = /\b(news|latest|today|breaking|recent)\b/i.test(cleanQuery);
    const baseQuery = isFreshTopic
        ? cleanQuery + " specific announcements launches research"
        : cleanQuery;
    const queryVariants = [
        baseQuery,
        baseQuery + " official announcement",
        baseQuery + " research report"
    ];

    const batches = await Promise.allSettled(queryVariants.map(searchProvider));
    const found = batches.flatMap(item => item.status === "fulfilled" ? item.value : []);
    if (!found.length) {
        const error = new Error("Internet search is unavailable or returned no results. Check your connection and try again.");
        error.status = 503;
        throw error;
    }

    const unique = new Map();
    for (const result of found) {
        if (isGenericPage(result)) continue;
        const normalized = normalizeUrl(result.url);
        const titleKey = result.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        const key = normalized || titleKey;
        const previous = unique.get(key);
        if (!previous || scoreResult(result) > scoreResult(previous)) unique.set(key, result);
    }

    const ranked = [...unique.values()].sort((a, b) => scoreResult(b) - scoreResult(a));
    const domainCounts = new Map();
    const diverse = [];
    for (const result of ranked) {
        const domain = new URL(result.url).hostname.replace(/^www\./, "");
        const count = domainCounts.get(domain) || 0;
        if (count >= 2) continue;
        domainCounts.set(domain, count + 1);
        diverse.push(result);
        if (diverse.length === 5) break;
    }
    return diverse;
}

module.exports = { search, buildSearchQuery };
