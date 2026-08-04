"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecutionLogSessionStore = void 0;
const EXECUTION_EVENT_TYPES = new Set([
    "bag.diagnostic",
    "scrape.failed",
    "engine.execution",
]);
const SESSION_LIMIT = 500;
function isExecutionLogEvent(eventType) {
    return typeof eventType === "string" && EXECUTION_EVENT_TYPES.has(eventType);
}
function formatExecutionMessage(log) {
    if (log.eventType === "scrape.failed" &&
        typeof log.metadata?.step === "string") {
        return `Stage failed: ${log.metadata.step}. ${log.message}`;
    }
    return log.message;
}
class ExecutionLogSessionStore {
    sessions = new Map();
    append(log) {
        const eventType = log.eventType ?? "";
        if (!isExecutionLogEvent(eventType)) {
            return null;
        }
        const bucket = this.sessions.get(log.engineId) ?? {
            entries: [],
            nextSequenceId: 1,
        };
        const sequenceId = bucket.nextSequenceId;
        bucket.nextSequenceId += 1;
        const entry = {
            sequenceId,
            id: log.id,
            engine_id: log.engineId,
            level: log.level,
            event_type: eventType,
            message: formatExecutionMessage(log),
            metadata: log.metadata ?? null,
            created_at: log.createdAt,
        };
        bucket.entries.push(entry);
        if (bucket.entries.length > SESSION_LIMIT) {
            bucket.entries.shift();
        }
        this.sessions.set(log.engineId, bucket);
        return entry;
    }
    getSnapshot(engineId) {
        return [...(this.sessions.get(engineId)?.entries ?? [])];
    }
    clear(engineId) {
        this.sessions.delete(engineId);
    }
    clearAll() {
        this.sessions.clear();
    }
}
exports.ExecutionLogSessionStore = ExecutionLogSessionStore;
