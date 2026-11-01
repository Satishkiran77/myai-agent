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

function isGenericPage(result) {
    try {
        const url = new URL(result.url);
        const path = url.pathname.toLowerCase().replace(/\/$/, "");
        const title = result.title.toLowerCase();
        const genericPath = /\/(category|categories|tag|tags|topic|topics|search|latest|news|artificial-intelligence|ai-news)(\.html)?$/.test(path);
        const homepage = !path || path === "/index.html" || path === "/news.html";
        const genericTitle = /\b(latest|news|updates|artificial intelligence|ai)\b/.test(title) &&
            !/\b(announces?|launches?|released?|unveils?|raises?|acquires?|develops?|introduces?|reports?|researchers?|study|model|chip|funding|deal|breakthrough)\b/.test(title);
        const genericSnippet = /latest news|read the latest|stay updated|browse thousands|news and analysis from/i.test(result.snippet);
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
    return score;
}

async function search(query) {
    const cleanQuery = buildSearchQuery(query);
    if (!cleanQuery) {
        const error = new Error("Please provide a topic to search for.");
        error.status = 400;
        throw error;
    }

    const providerQuery = /\b(news|latest|today|breaking)\b/i.test(cleanQuery)
        ? cleanQuery + " specific announcements launches research"
        : cleanQuery;
    const url = "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(providerQuery);
    let response;
    try {
        response = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; BENZAssistant/1.0)" },
            signal: AbortSignal.timeout(15000)
        });
    } catch {
        const error = new Error("Internet search is unavailable. Check your internet connection and try again.");
        error.status = 503;
        throw error;
    }

    if (!response.ok) {
        const error = new Error("The search provider returned status " + response.status + ".");
        error.status = 503;
        throw error;
    }

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
        if (result.title && result.snippet && /^https?:\/\//i.test(result.url)) {
            found.push(result);
        }
    }

    const specificResults = found
        .filter(result => !isGenericPage(result))
        .sort((a, b) => scoreResult(b) - scoreResult(a));

    return (specificResults.length ? specificResults : found.filter(result => !isGenericPage(result)))
        .slice(0, 5);
}

module.exports = { search, buildSearchQuery };
