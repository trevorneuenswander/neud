"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MIN_POLL_MS = exports.DEFAULT_POLL_MS = void 0;
exports.parsePollIntervalMs = parsePollIntervalMs;
exports.DEFAULT_POLL_MS = 1000;
exports.MIN_POLL_MS = 1000;
function parsePollIntervalMs(value) {
    const parsed = Number(value ?? exports.DEFAULT_POLL_MS);
    if (!Number.isFinite(parsed)) {
        return exports.DEFAULT_POLL_MS;
    }
    return Math.max(exports.MIN_POLL_MS, Math.trunc(parsed));
}
