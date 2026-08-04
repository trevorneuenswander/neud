"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActivitySessionStore = exports.ACTIVITY_OVERVIEW_LIMIT = void 0;
const activity_events_repository_1 = require("../repositories/activity-events-repository");
exports.ACTIVITY_OVERVIEW_LIMIT = 50;
class ActivitySessionStore {
    entries = [];
    nextSequenceId = 1;
    repository;
    constructor(repository) {
        this.repository = repository ?? null;
        if (this.repository) {
            this.nextSequenceId = this.repository.getMaxSequenceId() + 1;
            this.entries = this.repository.listNewestFirst().map(activity_events_repository_1.toActivityEvent);
        }
    }
    append(input) {
        const entry = {
            id: input.event.id ?? input.cloudId,
            type: input.event.type,
            message: input.event.message,
            timestamp: input.event.timestamp,
            source: input.event.source,
            severity: input.event.severity ?? "info",
            actor: input.event.actor,
            metadata: input.event.metadata,
        };
        if (this.repository) {
            this.repository.insert({
                event: entry,
                cloudId: input.cloudId,
                instanceId: input.instanceId,
                syncStatus: "pending",
            });
        }
        else if (!input.event.id?.startsWith("activity-")) {
            this.nextSequenceId += 1;
        }
        else {
            this.nextSequenceId += 1;
        }
        this.entries.unshift(entry);
        return entry;
    }
    upsertFromCloud(record) {
        const entry = (0, activity_events_repository_1.toActivityEvent)(record);
        const existingIndex = this.entries.findIndex((item) => item.id === entry.id);
        if (existingIndex >= 0) {
            this.entries[existingIndex] = entry;
            return entry;
        }
        this.entries.unshift(entry);
        this.entries.sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp));
        return entry;
    }
    reloadFromRepository() {
        if (!this.repository)
            return;
        this.entries = this.repository.listNewestFirst().map(activity_events_repository_1.toActivityEvent);
        this.nextSequenceId = this.repository.getMaxSequenceId() + 1;
    }
    getSnapshot(limit) {
        if (limit == null) {
            return [...this.entries];
        }
        return this.entries.slice(0, limit);
    }
    getOverviewSnapshot() {
        return this.getSnapshot(exports.ACTIVITY_OVERVIEW_LIMIT);
    }
    clear() {
        this.entries = [];
        this.nextSequenceId = 1;
    }
}
exports.ActivitySessionStore = ActivitySessionStore;
