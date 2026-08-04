import { randomUUID } from "crypto";
import type { LocalDatabase } from "../../database/connection";

export type BagManualEventType =
  | "enter_manual"
  | "exit_manual"
  | "select_previous_lot"
  | "select_next_lot"
  | "select_lot"
  | "edit_lot"
  | "set_bid"
  | "adjust_bid"
  | "set_status"
  | "clear_status";

export type BagManualEventRecord = {
  id: string;
  projectId: string;
  eventType: BagManualEventType;
  previousValue: unknown;
  nextValue: unknown;
  details: Record<string, unknown>;
  createdAt: string;
  createdBy: string | null;
};

export class BagManualEventsRepository {
  constructor(private readonly db: LocalDatabase) {}

  insert(input: {
    projectId: string;
    eventType: BagManualEventType;
    previousValue?: unknown;
    nextValue?: unknown;
    details?: Record<string, unknown>;
    createdBy?: string | null;
  }): BagManualEventRecord {
    const now = new Date().toISOString();
    const record: BagManualEventRecord = {
      id: randomUUID(),
      projectId: input.projectId,
      eventType: input.eventType,
      previousValue: input.previousValue ?? null,
      nextValue: input.nextValue ?? null,
      details: input.details ?? {},
      createdAt: now,
      createdBy: input.createdBy ?? null,
    };

    this.db
      .prepare(
        `INSERT INTO bag_manual_events (
          id, project_id, event_type, previous_value_json, next_value_json,
          details_json, created_at, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.projectId,
        record.eventType,
        JSON.stringify(record.previousValue),
        JSON.stringify(record.nextValue),
        JSON.stringify(record.details),
        record.createdAt,
        record.createdBy,
      );

    return record;
  }
}
