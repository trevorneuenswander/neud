import type { ActivityEventsRepository, ActivityEventRecord } from "../repositories/activity-events-repository";
import { toActivityEvent as mapRecordToEvent } from "../repositories/activity-events-repository";

export type ActivitySeverity = "info" | "warning" | "error";

export type ActivityActor = {
  id?: string;
  name: string;
  email?: string;
};

export type ActivityEvent = {
  id: string;
  type: string;
  message: string;
  timestamp: string;
  source?: string;
  severity?: ActivitySeverity;
  actor?: ActivityActor;
  metadata?: Record<string, unknown>;
};

type IncomingActivityEvent = Omit<ActivityEvent, "id"> & { id?: string };

export const ACTIVITY_OVERVIEW_LIMIT = 50;

export class ActivitySessionStore {
  private entries: ActivityEvent[] = [];
  private nextSequenceId = 1;
  private readonly repository: ActivityEventsRepository | null;

  constructor(repository?: ActivityEventsRepository | null) {
    this.repository = repository ?? null;
    if (this.repository) {
      this.nextSequenceId = this.repository.getMaxSequenceId() + 1;
      this.entries = this.repository.listNewestFirst().map(mapRecordToEvent);
    }
  }

  append(input: {
    event: IncomingActivityEvent;
    cloudId: string;
    instanceId: string;
  }): ActivityEvent {
    const entry: ActivityEvent = {
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
    } else if (!input.event.id?.startsWith("activity-")) {
      this.nextSequenceId += 1;
    } else {
      this.nextSequenceId += 1;
    }

    this.entries.unshift(entry);
    return entry;
  }

  upsertFromCloud(record: ActivityEventRecord): ActivityEvent {
    const entry = mapRecordToEvent(record);
    const existingIndex = this.entries.findIndex((item) => item.id === entry.id);
    if (existingIndex >= 0) {
      this.entries[existingIndex] = entry;
      return entry;
    }
    this.entries.unshift(entry);
    this.entries.sort(
      (left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp),
    );
    return entry;
  }

  reloadFromRepository(): void {
    if (!this.repository) return;
    this.entries = this.repository.listNewestFirst().map(mapRecordToEvent);
    this.nextSequenceId = this.repository.getMaxSequenceId() + 1;
  }

  getSnapshot(limit?: number): ActivityEvent[] {
    if (limit == null) {
      return [...this.entries];
    }
    return this.entries.slice(0, limit);
  }

  getOverviewSnapshot(): ActivityEvent[] {
    return this.getSnapshot(ACTIVITY_OVERVIEW_LIMIT);
  }

  clear() {
    this.entries = [];
    this.nextSequenceId = 1;
  }
}
