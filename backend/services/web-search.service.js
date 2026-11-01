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

async function search(query) {
    const url = "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query);
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
    const results = [];
    const pattern = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<(?:a|div)[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div)>/gi;
    let match;

    while ((match = pattern.exec(html)) && results.length < 5) {
        const title = cleanText(match[2]);
        const snippet = cleanText(match[3]);
        const link = decodeRedirect(decodeHtml(match[1]));
        if (title && snippet && /^https?:\/\//i.test(link)) {
            results.push({ title, snippet, url: link });
        }
    }

    return results;
}

module.exports = { search };
