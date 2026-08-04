"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateDisplaySlug = validateDisplaySlug;
exports.validateDisplaySource = validateDisplaySource;
const constants_shared_1 = require("../developer-tools/constants-shared");
const templates_1 = require("../developer-tools/templates");
function validateDisplaySlug(slug) {
    const issues = [];
    const normalized = slug.trim().toLowerCase();
    if (!normalized) {
        issues.push({ severity: "error", message: "Display slug is required." });
        return issues;
    }
    if (!constants_shared_1.DISPLAY_SLUG_PATTERN.test(normalized)) {
        issues.push({
            severity: "error",
            message: "Display slug must use lowercase letters, numbers, and hyphens.",
        });
    }
    if (constants_shared_1.RESERVED_DISPLAY_SLUGS.has(normalized)) {
        issues.push({
            severity: "error",
            message: `Display slug "${normalized}" is reserved.`,
        });
    }
    return issues;
}
function validateDisplaySource(input) {
    const issues = [];
    if (input.slug) {
        issues.push(...validateDisplaySlug(input.slug));
    }
    const totalBytes = Buffer.byteLength(`${input.html}\n${input.css ?? ""}\n${input.javascript ?? ""}`, "utf8");
    if (totalBytes > constants_shared_1.MAX_DISPLAY_SOURCE_BYTES) {
        issues.push({
            severity: "error",
            message: `Display source exceeds ${constants_shared_1.MAX_DISPLAY_SOURCE_BYTES} bytes.`,
        });
    }
    if (!input.html.trim()) {
        issues.push({ severity: "error", message: "Display HTML is required." });
    }
    for (const pattern of constants_shared_1.PROHIBITED_DISPLAY_PATTERNS) {
        const haystack = `${input.css ?? ""}\n${input.javascript ?? ""}`;
        if (pattern.test(haystack)) {
            issues.push({
                severity: "error",
                message: `Prohibited API usage detected: ${pattern.source}`,
            });
        }
    }
    if (!/^<!doctype html/i.test(input.html.trim()) &&
        !/^<html[\s>]/i.test(input.html.trim())) {
        try {
            (0, templates_1.buildDisplayDocument)({
                html: input.html,
                css: input.css,
                javascript: input.javascript,
            });
        }
        catch (error) {
            issues.push({
                severity: "error",
                message: error instanceof Error
                    ? error.message
                    : "Display document could not be assembled.",
            });
        }
    }
    else if (!/<html[\s>]/i.test(input.html)) {
        issues.push({
            severity: "error",
            message: "Standalone HTML must include an html element.",
        });
    }
    if (input.javascript?.trim()) {
        try {
            // eslint-disable-next-line no-new-func
            new Function(input.javascript);
        }
        catch (error) {
            issues.push({
                severity: "error",
                message: error instanceof Error
                    ? `JavaScript syntax error: ${error.message}`
                    : "Display JavaScript has syntax errors.",
            });
        }
    }
    const hasError = issues.some((issue) => issue.severity === "error");
    return {
        ok: !hasError,
        status: hasError ? "invalid" : "valid",
        issues,
    };
}
