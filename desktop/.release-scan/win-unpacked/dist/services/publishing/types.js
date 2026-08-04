"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishingProjectLastSuccessfulPublishAtKey = exports.publishingProjectLastPublishedRevisionKey = exports.publishingProjectLastPublishedHashKey = exports.publishingProjectEnabledCacheKey = exports.PUBLISHING_SETTINGS_POLL_MS = exports.PUBLISHING_MAX_PAYLOAD_BYTES = exports.PUBLISHING_DEBOUNCE_MS = exports.PUBLISHING_LEASE_DURATION_SECONDS = exports.PUBLISHING_HEARTBEAT_MS = exports.PUBLISHING_BACKOFF_MS = void 0;
exports.computePublishingBackoffMs = computePublishingBackoffMs;
exports.isRecoverablePublishingError = isRecoverablePublishingError;
exports.PUBLISHING_BACKOFF_MS = [5_000, 15_000, 45_000, 120_000];
exports.PUBLISHING_HEARTBEAT_MS = 20_000;
exports.PUBLISHING_LEASE_DURATION_SECONDS = 90;
exports.PUBLISHING_DEBOUNCE_MS = 750;
exports.PUBLISHING_MAX_PAYLOAD_BYTES = 1_048_576;
exports.PUBLISHING_SETTINGS_POLL_MS = 60_000;
const publishingProjectEnabledCacheKey = (projectId) => `publishing.project.${projectId}.enabledCache`;
exports.publishingProjectEnabledCacheKey = publishingProjectEnabledCacheKey;
const publishingProjectLastPublishedHashKey = (projectId) => `publishing.project.${projectId}.lastPublishedHash`;
exports.publishingProjectLastPublishedHashKey = publishingProjectLastPublishedHashKey;
const publishingProjectLastPublishedRevisionKey = (projectId) => `publishing.project.${projectId}.lastPublishedRevision`;
exports.publishingProjectLastPublishedRevisionKey = publishingProjectLastPublishedRevisionKey;
const publishingProjectLastSuccessfulPublishAtKey = (projectId) => `publishing.project.${projectId}.lastSuccessfulPublishAt`;
exports.publishingProjectLastSuccessfulPublishAtKey = publishingProjectLastSuccessfulPublishAtKey;
function computePublishingBackoffMs(attempt, schedule = exports.PUBLISHING_BACKOFF_MS) {
    const index = Math.min(Math.max(attempt, 0), schedule.length - 1);
    const base = schedule[index] ?? schedule[schedule.length - 1] ?? 5_000;
    const jitter = Math.floor(base * 0.2 * Math.random());
    return base + jitter;
}
function isRecoverablePublishingError(code) {
    if (!code) {
        return true;
    }
    return ![
        "publishing_disabled",
        "stale_revision",
        "payload_too_large",
        "lease_not_owned",
        "authentication_required",
        "forbidden",
        "invalid_input",
    ].includes(code);
}
