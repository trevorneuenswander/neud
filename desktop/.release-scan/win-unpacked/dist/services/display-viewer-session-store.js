"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DISPLAY_VIEWER_STALE_MS = exports.DisplayViewerSessionStore = void 0;
const DEFAULT_STALE_MS = 30_000;
class DisplayViewerSessionStore {
    sessions = new Map();
    touch(input) {
        const sessionId = input.sessionId ?? `${input.projectId}:${input.displayId}`;
        const existing = this.sessions.get(sessionId);
        const now = new Date().toISOString();
        const entry = {
            sessionId,
            projectId: input.projectId,
            displayId: input.displayId,
            connectedAt: existing?.connectedAt ?? now,
            lastHeartbeatAt: now,
        };
        this.sessions.set(sessionId, entry);
        this.pruneStale(DEFAULT_STALE_MS * 4);
        return entry;
    }
    /** Active viewer instances (unique session keys with recent heartbeats). */
    countActiveSessions(staleMs = DEFAULT_STALE_MS) {
        return this.listActiveSessions(staleMs).length;
    }
    /** Distinct displays with at least one active viewer session. */
    countActiveDistinctDisplays(staleMs = DEFAULT_STALE_MS) {
        const displayIds = new Set();
        for (const session of this.listActiveSessions(staleMs)) {
            displayIds.add(`${session.projectId}:${session.displayId}`);
        }
        return displayIds.size;
    }
    listActiveSessions(staleMs = DEFAULT_STALE_MS) {
        const cutoff = Date.now() - staleMs;
        return [...this.sessions.values()].filter((session) => new Date(session.lastHeartbeatAt).getTime() >= cutoff);
    }
    pruneStale(staleMs) {
        const cutoff = Date.now() - staleMs;
        for (const [sessionId, session] of this.sessions.entries()) {
            if (new Date(session.lastHeartbeatAt).getTime() < cutoff) {
                this.sessions.delete(sessionId);
            }
        }
    }
}
exports.DisplayViewerSessionStore = DisplayViewerSessionStore;
exports.DISPLAY_VIEWER_STALE_MS = DEFAULT_STALE_MS;
