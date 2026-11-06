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

function domainOf(value) {
    try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); }
    catch { return ""; }
}

const officialDomains = [
    "openai.com", "anthropic.com", "blog.google", "deepmind.google", "googleblog.com",
    "ai.meta.com", "about.fb.com", "microsoft.com", "blogs.microsoft.com", "nvidia.com",
    "x.ai", "huggingface.co", "stability.ai", "mistral.ai", "deepseek.com", "qwen.ai",
    "arxiv.org", "nature.com", "science.org", "acm.org", "ieee.org"
];
const reputableNewsDomains = [
    "reuters.com", "apnews.com", "bbc.com", "bbc.co.uk", "theverge.com",
    "techcrunch.com", "technologyreview.com", "wired.com", "ft.com", "nytimes.com"
];

const companyProfiles = [
    {
        name: "OpenAI",
        aliases: ["openai", "chatgpt", "gpt"],
        officialDomains: ["openai.com"]
    },
    {
        name: "Google",
        aliases: ["google", "deepmind", "gemini", "genie"],
        officialDomains: ["blog.google", "deepmind.google", "googleblog.com"]
    },
    {
        name: "Microsoft",
        aliases: ["microsoft", "copilot", "azure ai"],
        officialDomains: ["microsoft.com", "blogs.microsoft.com"]
    }
];

function containsAlias(value, alias) {
    const normalizedValue = " " + String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + " ";
    const normalizedAlias = " " + String(alias || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + " ";
    return normalizedValue.includes(normalizedAlias);
}

function requestedCompanies(query) {
    return companyProfiles.filter(company =>
        company.aliases.some(alias => containsAlias(query, alias))
    );
}

function matchesCompany(result, company) {
    const text = String(result.title || "") + " " + String(result.snippet || "");
    const domain = domainOf(result.url);
    return company.aliases.some(alias => containsAlias(text, alias)) ||
        matchesDomain(domain, company.officialDomains);
}

function looksNonEnglish(result) {
    const url = String(result.url || "").toLowerCase();
    const normalizedText = " " + (String(result.title || "") + " " + String(result.snippet || ""))
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim() + " ";
    // Use distinctive Spanish terms only; common words such as "una" or "para"
    // can appear in English names and snippets and cause false positives.
    const spanishSignals = [
        "desarrolla", "desarrollado", "medicos", "precision",
        "investigacion", "anuncia", "lanzamiento", "nueva",
        "nuevas", "empresa", "inteligencia artificial",
        "segun", "herramienta", "aprendizaje automatico"
    ];
    return /\/(?:es|es-es|es-mx)\//.test(url) ||
        spanishSignals.some(word => normalizedText.includes(" " + word + " "));
}

function matchesDomain(domain, list) {
    return list.some(item => domain === item || domain.endsWith("." + item));
}

function isGenericPage(result) {
    try {
        const url = new URL(result.url);
        const path = url.pathname.toLowerCase().replace(/\/$/, "");
        const title = result.title.toLowerCase();
        const genericPath = /\/(category|categories|tag|tags|topic|topics|search|latest|news|research|artificial-intelligence|ai-news|this-month|model-releases)(\/|\.html|$)/.test(path);
        const homepage = !path || path === "/index.html" || path === "/news.html";
        const genericTitle = /\b(latest|daily|news|updates|recap|roundup|digest|newsletter|artificial intelligence|ai news today|news today|release tracker|model releases|release timeline|launch tracker|all launches)\b/.test(title) &&
            !/\b(announces?|launches?|released?|unveils?|raises?|acquires?|develops?|introduces?|reports?|researchers?|study|model|chip|funding|deal|breakthrough|policy|retires?)\b/.test(title);
        const genericSnippet = /latest (?:ai )?news|daily ai news|news recap|news roundup|news digest|read the latest|stay updated|browse thousands|news and analysis from|summari[sz]ed in minutes|track(?:er|ing)? (?:all )?(?:the )?(?:latest )?(?:ai )?(?:model )?releases|complete timeline of (?:ai )?model releases/i.test(result.snippet);
        const roundupTitle = /\b(?:ai news today|latest ai news|ai news roundup|ai news recap|ai release tracker|model release tracker|model releases timeline)\b/.test(title);
        return genericPath || homepage || roundupTitle || (genericTitle && genericSnippet);
    } catch {
        return true;
    }
}

function scoreResult(result, companies = []) {
    const domain = domainOf(result.url);
    let score = 0;
    for (const company of companies) {
        if (matchesCompany(result, company) || result.matchedCompany === company.name) score += 9;
    }
    // Prefer English-language coverage when the user writes the query in English.
    if (looksNonEnglish(result)) score -= 8;
    if (matchesDomain(domain, officialDomains)) score += 8;
    else if (matchesDomain(domain, reputableNewsDomains)) score += 5;
    const text = result.title + " " + result.snippet;
    if (/\b(announces?|launches?|released?|unveils?|raises?|acquires?|develops?|introduces?|reports?|researchers?|study|model|chip|funding|deal|breakthrough|policy|retires?)\b/i.test(result.title)) score += 4;
    if (/\b(202[5-9]|today|yesterday|hours ago|days ago|october|november|december)\b/i.test(text)) score += 2;
    if (/\b(according to|said|research|company|researchers|announced|launched)\b/i.test(result.snippet)) score += 1;
    if (/\/(20\d{2})\//.test(result.url)) score += 1;
    if (/\b(official|press release|study|paper|report)\b/i.test(text)) score += 1;
    return score;
}

function selectDiverseResults(ranked, companies = [], maxResults = 12) {
    const domainCounts = new Map();
    const diverse = [];

    const addResult = result => {
        const domain = domainOf(result.url);
        const count = domainCounts.get(domain) || 0;
        if (!domain || count >= 2) return false;

        domainCounts.set(domain, count + 1);
        diverse.push({
            ...result,
            sourceType: matchesDomain(domain, officialDomains) ? "official" :
                matchesDomain(domain, reputableNewsDomains) ? "established-news" : "other"
        });
        return true;
    };

    // Reserve an initial slot for each requested company when relevant results exist.
    for (const company of companies) {
        const candidate = ranked.find(result =>
            (matchesCompany(result, company) || result.matchedCompany === company.name) &&
            !domainCounts.has(domainOf(result.url))
        );
        if (candidate) addResult(candidate);
    }

    // Fill remaining slots with the strongest relevant, domain-diverse results.
    for (const result of ranked) {
        if (diverse.length >= maxResults) break;
        addResult(result);
    }

    return diverse;
}

async function searchProvider(query, options = {}) {
    const params = new URLSearchParams({ q: query });
    // DuckDuckGo's past-month filter helps surface current articles before
    // the stricter publication-date validation in article-fetch.service.
    if (options.pastMonth) params.set("df", "m");
    const url = "https://html.duckduckgo.com/html/?" + params.toString();
    const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; BENZAssistant/1.0)" },
        signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error("Search provider returned status " + response.status + ".");

    const html = await response.text();
    const found = [];
    const pattern = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<(?:a|div)[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div)>/gi;
    let match;
    while ((match = pattern.exec(html)) && found.length < 30) {
        const result = {
            title: cleanText(match[2]),
            snippet: cleanText(match[3]),
            url: decodeRedirect(decodeHtml(match[1])),
            matchedCompany: options.company || null
        };
        if (result.title && /^https?:\/\//i.test(result.url)) found.push(result);
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
    const baseQuery = isFreshTopic ? cleanQuery + " specific announcement launch study" : cleanQuery;
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffDate = [cutoff.getFullYear(), String(cutoff.getMonth() + 1).padStart(2, "0"), String(cutoff.getDate()).padStart(2, "0")].join("-");
    const currentMonth = now.toLocaleString("en-US", { month: "long", year: "numeric" });
    const companies = requestedCompanies(cleanQuery);
    const queryVariants = isFreshTopic ? [
        baseQuery + " after:" + cutoffDate + " official announcement",
        baseQuery + " after:" + cutoffDate + " site:openai.com OR site:anthropic.com OR site:blog.google OR site:deepmind.google",
        baseQuery + " after:" + cutoffDate + " site:reuters.com OR site:apnews.com OR site:bbc.com OR site:theverge.com",
        baseQuery + " after:" + cutoffDate + " site:techcrunch.com OR site:technologyreview.com OR site:wired.com",
        baseQuery + " " + currentMonth + " AI announcement research"
    ] : [
        baseQuery + " official source",
        baseQuery + " company announcement",
        baseQuery + " independent reporting research"
    ];

    // Add focused searches for every company explicitly named by the user.
    // This prevents a broad multi-company query from returning only one company's news.
    const targetedVariants = isFreshTopic ? companies.flatMap(company => {
        const officialSiteQueries = company.officialDomains.flatMap(domain => [
            "site:" + domain + " " + company.name + " AI announcement OR launch OR research after:" + cutoffDate,
            "site:" + domain + " " + company.name + " AI " + currentMonth
        ]);
        return [
            company.name + " AI announcement OR launch OR research after:" + cutoffDate + " English",
            ...officialSiteQueries,
            company.name + " AI news after:" + cutoffDate + " site:reuters.com OR site:apnews.com OR site:bbc.com OR site:theverge.com OR site:techcrunch.com OR site:wired.com",
            company.name + " latest AI product model research announcement " + currentMonth
        ].map(query => ({ query, company: company.name }));
    }) : [];
    const allQueryVariants = [
        ...queryVariants.map(query => ({ query, company: null })),
        ...targetedVariants
    ];
    const batches = await Promise.allSettled(allQueryVariants.map(item =>
        searchProvider(item.query, { pastMonth: isFreshTopic, company: item.company })
    ));
    const found = batches.flatMap(item => item.status === "fulfilled" ? item.value : []);
    if (!found.length) {
        const error = new Error("Internet search is unavailable or returned no results. Check your connection and try again.");
        error.status = 503;
        throw error;
    }

    const unique = new Map();
    for (const result of found) {
        if (isGenericPage(result)) continue;
        // When companies were explicitly requested, discard articles that do not
        // identify any requested company in the headline, snippet, or official domain.
        if (companies.length && !companies.some(company =>
            matchesCompany(result, company) || result.matchedCompany === company.name
        )) continue;
        const normalized = normalizeUrl(result.url);
        const titleKey = result.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        const key = normalized || titleKey;
        const previous = unique.get(key);
        if (!previous || scoreResult(result, companies) > scoreResult(previous, companies)) unique.set(key, result);
    }

    let ranked = [...unique.values()].sort((a, b) => scoreResult(b, companies) - scoreResult(a, companies));
    // Broad "latest news" searches must not use low-confidence aggregators as evidence.
    if (isFreshTopic) {
        ranked = ranked.filter(result => {
            const domain = domainOf(result.url);
            return matchesDomain(domain, officialDomains) || matchesDomain(domain, reputableNewsDomains);
        });
    }
    return selectDiverseResults(ranked, companies, 12);
}

module.exports = { search, buildSearchQuery, selectDiverseResults };
