const rules = [
    {
        intent: "memory",
        patterns: [
            /^remember(?: this)?\b/i,
            /\b(save|store) (?:this|that|my preference)\b/i,
            /\bwhat do you remember about me\b/i,
            /\b(show|list|view) my memories\b/i,
            /\b(forget|delete|remove) (?:that|this|my memory|my preference)\b/i
        ]
    },
    {
        intent: "web_search",
        patterns: [
            /^\s*(search|look up|find online)\b/i,
            /\b(latest|today's|current) (news|updates|weather|price|events)\b/i,
            /\b(search the web|browse the internet|on the internet)\b/i
        ]
    },
    {
        intent: "file_action",
        patterns: [
            /^\s*(read|open|summarize|analyse|analyze|create|write|rename|move|delete) (?:the )?(file|document|folder)\b/i,
            /\battached file\b/i
        ]
    },
    {
        intent: "computer_action",
        patterns: [
            /^\s*(open|launch|start|close) (?:the )?(notepad|calculator|browser|chrome|edge|application|app)\b/i
        ]
    },
    {
        intent: "coding",
        patterns: [
            /^\s*(write|create|debug|fix|review|explain) (?:the )?(code|program|function|class|api|website|script)\b/i,
            /\b(debug this|fix this bug|review this code)\b/i
        ]
    }
];

function understandIntent(message) {
    if (typeof message !== "string" || !message.trim()) {
        return { intent: "unknown", confidence: 0 };
    }

    const input = message.trim();

    for (const rule of rules) {
        if (rule.patterns.some(pattern => pattern.test(input))) {
            return {
                intent: rule.intent,
                confidence: 0.8,
                requiresApproval: ["file_action", "computer_action"].includes(rule.intent)
            };
        }
    }

    return {
        intent: "general_chat",
        confidence: 0.6,
        requiresApproval: false
    };
}

module.exports = { understandIntent };
