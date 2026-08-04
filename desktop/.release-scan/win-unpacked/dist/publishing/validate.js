"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePublishedProjectPayload = validatePublishedProjectPayload;
const contract_1 = require("./contract");
const ISO_8601_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function isIso8601Utc(value) {
    return typeof value === "string" && ISO_8601_PATTERN.test(value);
}
function validatePublishedProjectPayload(value) {
    const issues = [];
    if (!isRecord(value)) {
        return { ok: false, issues: ["Payload must be an object."] };
    }
    if (value.contractVersion !== contract_1.NEUD_PUBLISHED_PROJECT_CONTRACT_VERSION) {
        issues.push("contractVersion must be 1.0.");
    }
    if (typeof value.projectId !== "string" || !value.projectId.trim()) {
        issues.push("projectId is required.");
    }
    if (typeof value.projectSlug !== "string" || !value.projectSlug.trim()) {
        issues.push("projectSlug is required.");
    }
    if (typeof value.revision !== "number" || !Number.isInteger(value.revision) || value.revision < 0) {
        issues.push("revision must be a non-negative integer.");
    }
    if (!isIso8601Utc(value.generatedAt)) {
        issues.push("generatedAt must be an ISO 8601 UTC timestamp.");
    }
    if (!isRecord(value.publisher)) {
        issues.push("publisher must be an object.");
    }
    else {
        if (typeof value.publisher.instanceId !== "string" || !value.publisher.instanceId.trim()) {
            issues.push("publisher.instanceId is required.");
        }
        if (!isIso8601Utc(value.publisher.lastSeenAt)) {
            issues.push("publisher.lastSeenAt must be an ISO 8601 UTC timestamp.");
        }
    }
    if (!isRecord(value.source)) {
        issues.push("source must be an object.");
    }
    else {
        if (value.source.mode !== "webpage-scraper" &&
            value.source.mode !== "local-controller") {
            issues.push("source.mode must be webpage-scraper or local-controller.");
        }
        if (typeof value.source.connected !== "boolean") {
            issues.push("source.connected must be a boolean.");
        }
    }
    if (!isRecord(value.data)) {
        issues.push("data must be an object.");
    }
    else {
        const data = value.data;
        if (!Array.isArray(data.next) || !Array.isArray(data.lots)) {
            issues.push("data.next and data.lots must be arrays.");
        }
        if (data.dataSource !== "webpage-scraper" &&
            data.dataSource !== "local-controller") {
            issues.push("data.dataSource must be webpage-scraper or local-controller.");
        }
        if (typeof data.updatedAt !== "string" || !data.updatedAt.trim()) {
            issues.push("data.updatedAt is required.");
        }
    }
    if (issues.length > 0) {
        return { ok: false, issues };
    }
    return { ok: true, payload: value };
}
