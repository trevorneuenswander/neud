export type EngineStatusSnapshot = {
  engineId: string;
  lastRunSucceededAt: string | null;
  lastError: string | null;
  actualState: string | null;
  healthState: string | null;
};

export class EngineStatusSessionStore {
  private snapshots = new Map<string, EngineStatusSnapshot>();

  set(engineId: string, snapshot: Omit<EngineStatusSnapshot, "engineId">) {
    this.snapshots.set(engineId, {
      engineId,
      lastRunSucceededAt: snapshot.lastRunSucceededAt,
      lastError: snapshot.lastError,
      actualState: snapshot.actualState,
      healthState: snapshot.healthState,
    });
  }

  get(engineId: string): EngineStatusSnapshot | null {
    return this.snapshots.get(engineId) ?? null;
  }

  clear(engineId: string) {
    this.snapshots.delete(engineId);
  }

  clearAll() {
    this.snapshots.clear();
  }
}
