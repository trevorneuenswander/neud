"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EngineStatusSessionStore = void 0;
class EngineStatusSessionStore {
    snapshots = new Map();
    set(engineId, snapshot) {
        this.snapshots.set(engineId, {
            engineId,
            lastRunSucceededAt: snapshot.lastRunSucceededAt,
            lastError: snapshot.lastError,
            actualState: snapshot.actualState,
            healthState: snapshot.healthState,
        });
    }
    get(engineId) {
        return this.snapshots.get(engineId) ?? null;
    }
    clear(engineId) {
        this.snapshots.delete(engineId);
    }
    clearAll() {
        this.snapshots.clear();
    }
}
exports.EngineStatusSessionStore = EngineStatusSessionStore;
