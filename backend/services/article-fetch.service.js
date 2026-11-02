const dns = require("node:dns").promises;
const net = require("node:net");

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
            new RegExp("<meta[^>]+(?:name|property)=['\"]" + name + "['\"][^>]+content=['\"]([^'\"]+)['\"]", "i"),
            new RegExp("<meta[^>]+content=['\"]([^'\"]+)['\"][^>]+(?:name|property)=['\"]" + name + "['\"]", "i")
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

function isPublicIPv4(address) {
    const parts = address.split(".").map(Number);
    if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
    const [a, b, c] = parts;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 168 || (b === 0 && c === 0) || (b === 0 && c === 2))) return false;
    if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    if (a === 192 && b === 88 && c === 99) return false;
    if (a === 255) return false;
    return true;
}

function isPublicIPv6(address) {
    const value = address.toLowerCase().split("%")[0];
    if (value.startsWith("::ffff:")) {
        const mapped = value.slice(7);
        if (net.isIP(mapped) === 4) return isPublicIPv4(mapped);
        return false;
    }
    if (!value.startsWith("2") && !value.startsWith("3")) return false;
    if (!/^[23][0-9a-f:]+$/.test(value)) return false;
    if (value.startsWith("2001:db8:")) return false;
    return true;
}

async function validatePublicUrl(value) {
    let url;
    try {
        url = new URL(value);
    } catch {
        throw new Error("Invalid article URL.");
    }

    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
        (url.port && !["80", "443"].includes(url.port)) ||
        url.hostname.endsWith(".local") || url.hostname.endsWith(".internal") ||
        url.hostname === "localhost" || url.hostname.endsWith(".localhost")) {
        throw new Error("Article URL is not allowed.");
    }

    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    const ipVersion = net.isIP(hostname);
    if (ipVersion === 4 && !isPublicIPv4(hostname)) throw new Error("Private IP addresses are not allowed.");
    if (ipVersion === 6 && !isPublicIPv6(hostname)) throw new Error("Non-public IPv6 addresses are not allowed.");

    if (!ipVersion) {
        const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
        if (!addresses.length || addresses.some(item =>
            item.family === 4 ? !isPublicIPv4(item.address) :
            item.family === 6 ? !isPublicIPv6(item.address) : true
        )) {
            throw new Error("The article host resolves to a non-public address.");
        }
    }
    return url;
}

async function readLimitedBody(response, limit) {
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > limit) throw new Error("Article page is too large.");
    if (!response.body) return "";
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > limit) {
                await reader.cancel();
                throw new Error("Article page is too large.");
            }
            chunks.push(Buffer.from(value));
        }
    } finally {
        reader.releaseLock();
    }
    return Buffer.concat(chunks).toString("utf8");
}

async function requestArticlePage(initialUrl) {
    let currentUrl = initialUrl;
    for (let redirects = 0; redirects <= 3; redirects++) {
        const target = await validatePublicUrl(currentUrl);
        const response = await fetch(target.href, {
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; BENZAssistant/1.0)",
                "Accept": "text/html,application/xhtml+xml"
            },
            redirect: "manual",
            signal: AbortSignal.timeout(10000)
        });

        if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers.get("location");
            await response.body?.cancel();
            if (!location || redirects === 3) throw new Error("Too many or invalid article redirects.");
            currentUrl = new URL(location, target).href;
            continue;
        }

        if (!response.ok || !(response.headers.get("content-type") || "").toLowerCase().includes("text/html")) {
            await response.body?.cancel();
            return null;
        }
        return { response, finalUrl: target.href };
    }
    return null;
}

function extractVisibleDate(value) {
    const text = String(value || "").slice(0, 1800);
    const match = text.match(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+20\d{2}\b|\b20\d{2}-\d{2}-\d{2}\b/i);
    return match ? match[0] : "";
}

function dateIsInFuture(value) {
    if (!value) return false;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return false;
    const publishedDay = /^\d{4}-\d{2}-\d{2}/.test(value)
        ? value.slice(0, 10)
        : [parsed.getFullYear(), String(parsed.getMonth() + 1).padStart(2, "0"), String(parsed.getDate()).padStart(2, "0")].join("-");
    const now = new Date();
    const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
    return publishedDay > today;
}

async function fetchArticle(result) {
    try {
        const page = await requestArticlePage(result.url);
        if (!page) return result;

        const html = await readLimitedBody(page.response, 1000000);
        const articleMatch = html.match(/<(article|main)\b[^>]*>([\s\S]*?)<\/\1>/i);
        const rawContent = articleMatch ? articleMatch[2] : html;
        const content = stripMarkup(rawContent).slice(0, 5000);
        const title = extractMeta(html, ["og:title", "twitter:title"]) ||
            ((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || result.title);
        const description = extractMeta(html, ["og:description", "description"]) || result.snippet;
        const structuredDate = (html.match(/["']datePublished["']\s*:\s*["']([^"']+)["']/i) || [])[1] || "";
        const metaDate = extractMeta(html, [
            "article:published_time", "datePublished", "pubdate", "publish-date"
        ]);
        const extractedContent = content.length > 200 ? content : "";
        const visibleDate = extractVisibleDate(stripMarkup(title) + " " + stripMarkup(description) + " " + extractedContent);
        const publishedAt = metaDate || structuredDate || visibleDate || null;
        if (dateIsInFuture(publishedAt)) return null;

        return {
            ...result,
            title: stripMarkup(title) || result.title,
            snippet: stripMarkup(description) || result.snippet,
            publishedAt,
            dateSource: metaDate ? "page-metadata" : structuredDate ? "structured-data" : visibleDate ? "page-text" : null,
            articleContent: extractedContent
        };
    } catch {
        const visibleDate = extractVisibleDate(result.title + " " + result.snippet);
        if (dateIsInFuture(visibleDate)) return null;
        return { ...result, publishedAt: visibleDate || null, dateSource: visibleDate ? "search-result-text" : null };
    }
}

async function enrichArticles(results, options = {}) {
    const enriched = await Promise.all(results.slice(0, 6).map(fetchArticle));
    const valid = enriched.filter(Boolean);
    if (!Number.isFinite(options.maxAgeDays)) return valid;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - options.maxAgeDays);
    return valid.filter(item => {
        if (!item.publishedAt) return false;
        const published = new Date(item.publishedAt);
        return !Number.isNaN(published.getTime()) && published <= new Date() && published >= cutoff;
    });
}

module.exports = { enrichArticles };
