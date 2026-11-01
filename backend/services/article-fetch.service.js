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

function extractMeta(html, names) {
    for (const name of names) {
        const patterns = [
            new RegExp('<meta[^>]+(?:name|property)=["\\']' + name + '["\\'][^>]+content=["\\']([^"\\']+)["\\']', "i"),
            new RegExp('<meta[^>]+content=["\\']([^"\\']+)["\\'][^>]+(?:name|property)=["\\']' + name + '["\\']', "i")
        ];
        for (const pattern of patterns) {
            const match = html.match(pattern);
            if (match) return decodeHtml(match[1]);
        }
    }
    return "";
}

function stripMarkup(value) {
    return decodeHtml(value
        .replace(/<(script|style|noscript|svg|nav|footer|header|aside)[^>]*>[\s\S]*?<\/\1>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/\s+/g, " ")
        .trim());
}

async function fetchArticle(result) {
    try {
        const target = new URL(result.url);
        if (!["http:", "https:"].includes(target.protocol) ||
            /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\])/i.test(target.hostname)) {
            return result;
        }

        const response = await fetch(target.href, {
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; BENZAssistant/1.0)",
                "Accept": "text/html,application/xhtml+xml"
            },
            redirect: "follow",
            signal: AbortSignal.timeout(10000)
        });

        const finalUrl = new URL(response.url);
        if (!response.ok || !["http:", "https:"].includes(finalUrl.protocol) ||
            !(response.headers.get("content-type") || "").includes("text/html")) {
            return result;
        }

        const html = (await response.text()).slice(0, 1000000);
        const articleMatch = html.match(/<(article|main)\b[^>]*>([\s\S]*?)<\/\1>/i);
        const rawContent = articleMatch ? articleMatch[2] : html;
        const content = stripMarkup(rawContent).slice(0, 5000);
        const title = extractMeta(html, ["og:title", "twitter:title"]) ||
            ((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || result.title);
        const description = extractMeta(html, ["og:description", "description"]) || result.snippet;
        const publishedAt = extractMeta(html, [
            "article:published_time", "datePublished", "pubdate", "publish-date"
        ]);

        return {
            ...result,
            title: stripMarkup(title) || result.title,
            snippet: stripMarkup(description) || result.snippet,
            publishedAt: publishedAt || null,
            articleContent: content.length > 200 ? content : ""
        };
    } catch {
        return result;
    }
}

async function enrichArticles(results) {
    return Promise.all(results.slice(0, 3).map(fetchArticle));
}

module.exports = { enrichArticles };
