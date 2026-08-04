"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isReserveStatus = isReserveStatus;
exports.normalizeReserveStatus = normalizeReserveStatus;
exports.formatReserveStatusLabel = formatReserveStatusLabel;
exports.getVisibleReserveLabel = getVisibleReserveLabel;
exports.resolveReserveStatusDisplayLabel = resolveReserveStatusDisplayLabel;
exports.readReserveStatusFromRecord = readReserveStatusFromRecord;
exports.serializeReserveStatusForStorage = serializeReserveStatusForStorage;
exports.resolveMergedReserveStatusLabel = resolveMergedReserveStatusLabel;
exports.resolveStoredReserveStatusLabel = resolveStoredReserveStatusLabel;
exports.resolveMergedReserveStatusLabelOrUnknown = resolveMergedReserveStatusLabelOrUnknown;
exports.resolveLotReserveStatusLabel = resolveLotReserveStatusLabel;
const RESERVE_STATUS_VALUES = [
    "has_reserve",
    "offered_without_reserve",
    "unknown",
];
const LEGACY_RESERVE_STATUS_MAP = {
    reserve_met: "has_reserve",
    reserve_not_met: "has_reserve",
    no_reserve: "offered_without_reserve",
    "no-reserve": "offered_without_reserve",
    reserve: "has_reserve",
    has_reserve: "has_reserve",
    offered_without_reserve: "offered_without_reserve",
    unknown: "unknown",
};
function isReserveStatus(value) {
    return (typeof value === "string" &&
        RESERVE_STATUS_VALUES.includes(value));
}
function normalizeReserveStatus(value) {
    if (value == null)
        return "unknown";
    if (isReserveStatus(value))
        return value;
    if (typeof value === "boolean") {
        return value ? "has_reserve" : "has_reserve";
    }
    const text = String(value).trim().toLowerCase();
    if (!text || text === "—" || text === "-")
        return "unknown";
    const legacy = LEGACY_RESERVE_STATUS_MAP[text.replace(/\s+/g, "_")];
    if (legacy)
        return legacy;
    if (/no\s*reserve|offered\s+without\s+reserve|without\s+reserve/.test(text)) {
        return "offered_without_reserve";
    }
    if (/has\s+reserve|^reserve\b|reserve\s*met|reserve\s*not\s*met|not\s*met|^reserved\b/.test(text)) {
        return "has_reserve";
    }
    return "unknown";
}
function formatReserveStatusLabel(status) {
    switch (status) {
        case "has_reserve":
            return "Has Reserve";
        case "offered_without_reserve":
            return "Offered Without Reserve";
        default:
            return "Unknown";
    }
}
function getVisibleReserveLabel(status) {
    return status === "offered_without_reserve"
        ? "OFFERED WITHOUT RESERVE"
        : null;
}
/** @deprecated Prefer getVisibleReserveLabel for display output. */
function resolveReserveStatusDisplayLabel(value) {
    const normalized = normalizeReserveStatus(value);
    if (normalized === "unknown") {
        return "";
    }
    return getVisibleReserveLabel(normalized) ?? "";
}
function readReserveStatusFromRecord(record) {
    if (!record)
        return "unknown";
    const candidates = [
        record.reserveStatus,
        record.reserve_status,
        record.reserve,
        record.reserveText,
        record.reserve_text,
        record.hasReserve,
        record.noReserve,
    ];
    for (const candidate of candidates) {
        const normalized = normalizeReserveStatus(candidate);
        if (normalized !== "unknown") {
            return normalized;
        }
    }
    return "unknown";
}
function serializeReserveStatusForStorage(value) {
    return normalizeReserveStatus(value);
}
function resolveMergedReserveStatusLabel(submittedValue, datasetRecord) {
    const fromSubmitted = getVisibleReserveLabel(normalizeReserveStatus(submittedValue));
    if (fromSubmitted)
        return fromSubmitted;
    if (datasetRecord) {
        const canonical = readReserveStatusFromRecord(datasetRecord);
        const label = getVisibleReserveLabel(canonical);
        if (label)
            return label;
    }
    return "";
}
function resolveStoredReserveStatusLabel(submittedValue, datasetRecord) {
    const normalizedSubmitted = normalizeReserveStatus(submittedValue);
    if (normalizedSubmitted !== "unknown") {
        return formatReserveStatusLabel(normalizedSubmitted);
    }
    if (datasetRecord) {
        const fromDataset = readReserveStatusFromRecord(datasetRecord);
        if (fromDataset !== "unknown") {
            return formatReserveStatusLabel(fromDataset);
        }
    }
    return "Unknown";
}
function resolveMergedReserveStatusLabelOrUnknown(submittedValue, datasetRecord) {
    return resolveStoredReserveStatusLabel(submittedValue, datasetRecord);
}
function resolveLotReserveStatusLabel(raw, matched) {
    const fromDataset = resolveMergedReserveStatusLabel(undefined, raw);
    if (fromDataset)
        return fromDataset;
    if (matched?.reserveStatus) {
        const label = getVisibleReserveLabel(normalizeReserveStatus(matched.reserveStatus));
        return label || undefined;
    }
    return undefined;
}
