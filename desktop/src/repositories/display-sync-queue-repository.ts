import { randomUUID } from "crypto";
import type { LocalDatabase } from "../database/connection";
import { DISPLAY_SYNC_BACKOFF_MS } from "../services/display-sync/types";

export type DisplaySyncQueueEntry = {
  id: string;
  entityType: string;
  entityId: string;
  operationType: string;
  payload: Record<string, unknown>;
  createdAt: string;
  attemptCount: number;
  lastAttemptAt: string | null;
  lastError: string | null;
  syncState: string;
  sourceInstanceId: string;
};

export type DisplaySyncQueueEligibility = {
  eligibleNow: boolean;
  exclusionReason: string | null;
};

export type DisplaySyncQueueSummary = {
  pendingDisplayRows: number;
  pendingRevisionRows: number;
  pendingTombstoneRows: number;
  failedDisplayRows: number;
  failedRevisionRows: number;
  oldestPendingAt: string | null;
  lastErrorCode: string | null;
  eligibleNowCount: number;
  delayedRetryCount: number;
};

export const MAX_QUEUE_ATTEMPTS = 10;

const DISPLAY_OPERATION_TYPES = [
  "display.update",
  "display.create",
  "display.archive",
  "display.unarchive",
  "display.order.update",
  "display.active_revision.update",
] as const;

export class DisplaySyncQueueRepository {
  constructor(private readonly db: LocalDatabase) {}

  enqueue(input: {
    entityType: string;
    entityId: string;
    operationType: string;
    payload?: Record<string, unknown>;
    sourceInstanceId: string;
  }): DisplaySyncQueueEntry {
    const coalesced = this.findPendingDuplicate(
      input.entityType,
      input.entityId,
      input.operationType,
    );
    if (coalesced) {
      this.db
        .prepare(
          `UPDATE display_sync_queue
           SET payload_json = ?, created_at = ?, sync_state = 'pending', last_error = NULL
           WHERE id = ?`,
        )
        .run(JSON.stringify(input.payload ?? {}), new Date().toISOString(), coalesced.id);
      return { ...coalesced, payload: input.payload ?? {}, syncState: "pending", lastError: null };
    }

    const entry: DisplaySyncQueueEntry = {
      id: randomUUID(),
      entityType: input.entityType,
      entityId: input.entityId,
      operationType: input.operationType,
      payload: input.payload ?? {},
      createdAt: new Date().toISOString(),
      attemptCount: 0,
      lastAttemptAt: null,
      lastError: null,
      syncState: "pending",
      sourceInstanceId: input.sourceInstanceId,
    };

    this.db
      .prepare(
        `INSERT INTO display_sync_queue (
          id, entity_type, entity_id, operation_type, payload_json,
          created_at, attempt_count, sync_state, source_instance_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.id,
        entry.entityType,
        entry.entityId,
        entry.operationType,
        JSON.stringify(entry.payload),
        entry.createdAt,
        entry.attemptCount,
        entry.syncState,
        entry.sourceInstanceId,
      );

    return entry;
  }

  listPending(limit = 100): DisplaySyncQueueEntry[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM display_sync_queue
         WHERE sync_state IN ('pending', 'failed')
         ORDER BY created_at ASC
         LIMIT ?`,
      )
      .all(limit) as Record<string, unknown>[];

    return rows.map(mapRow);
  }

  listAllPending(limit = 200): DisplaySyncQueueEntry[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM display_sync_queue
         WHERE sync_state IN ('pending', 'failed', 'irrecoverable')
         ORDER BY created_at ASC
         LIMIT ?`,
      )
      .all(limit) as Record<string, unknown>[];

    return rows.map(mapRow);
  }

  listPendingDisplayOperations(limit = 100): DisplaySyncQueueEntry[] {
    const placeholders = DISPLAY_OPERATION_TYPES.map(() => "?").join(", ");
    const rows = this.db
      .prepare(
        `SELECT * FROM display_sync_queue
         WHERE sync_state IN ('pending', 'failed')
           AND operation_type IN (${placeholders})
         ORDER BY created_at ASC
         LIMIT ?`,
      )
      .all(...DISPLAY_OPERATION_TYPES, limit) as Record<string, unknown>[];

    return rows.map(mapRow);
  }

  listPendingRevisionCreates(limit = 100): DisplaySyncQueueEntry[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM display_sync_queue
         WHERE sync_state IN ('pending', 'failed')
           AND operation_type = 'display.revision.create'
         ORDER BY created_at ASC
         LIMIT ?`,
      )
      .all(limit) as Record<string, unknown>[];

    return rows.map(mapRow);
  }

  listEligibleRevisionCreates(limit = 100, now = Date.now()): DisplaySyncQueueEntry[] {
    return this.listPendingRevisionCreates(limit).filter(
      (entry) => this.getEligibility(entry, now).eligibleNow,
    );
  }

  listEligiblePending(limit = 200, now = Date.now()): DisplaySyncQueueEntry[] {
    return this.listPending(limit).filter((entry) => this.getEligibility(entry, now).eligibleNow);
  }

  getEligibility(entry: DisplaySyncQueueEntry, now = Date.now()): DisplaySyncQueueEligibility {
    if (entry.syncState === "synced" || entry.syncState === "irrecoverable") {
      return { eligibleNow: false, exclusionReason: "not_pending" };
    }

    const attemptCount = Number.isFinite(entry.attemptCount) ? entry.attemptCount : 0;
    if (attemptCount >= MAX_QUEUE_ATTEMPTS) {
      return { eligibleNow: false, exclusionReason: "max_attempts_exceeded" };
    }

    if (entry.syncState === "failed" && entry.lastAttemptAt) {
      const backoffIndex = Math.min(
        Math.max(attemptCount - 1, 0),
        DISPLAY_SYNC_BACKOFF_MS.length - 1,
      );
      const nextAttemptAt =
        new Date(entry.lastAttemptAt).getTime() + DISPLAY_SYNC_BACKOFF_MS[backoffIndex]!;
      if (now < nextAttemptAt) {
        return { eligibleNow: false, exclusionReason: "delayed_retry" };
      }
    }

    return { eligibleNow: true, exclusionReason: null };
  }

  countEligiblePending(now = Date.now()): number {
    return this.listPending(1000).filter((entry) => this.getEligibility(entry, now).eligibleNow)
      .length;
  }

  countDelayedRetryPending(now = Date.now()): number {
    return this.listPending(1000).filter((entry) => {
      const eligibility = this.getEligibility(entry, now);
      return !eligibility.eligibleNow && eligibility.exclusionReason === "delayed_retry";
    }).length;
  }

  listPendingProjectIds(limit = 200): string[] {
    const rows = this.db
      .prepare(
        `SELECT payload_json FROM display_sync_queue
         WHERE sync_state IN ('pending', 'failed')
         ORDER BY created_at ASC
         LIMIT ?`,
      )
      .all(limit) as Array<{ payload_json: string }>;

    const projectIds = new Set<string>();
    for (const row of rows) {
      try {
        const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
        if (typeof payload.projectId === "string" && payload.projectId.length > 0) {
          projectIds.add(payload.projectId);
        }
      } catch {
        // Ignore malformed payloads.
      }
    }
    return [...projectIds];
  }

  markSynced(id: string): void {
    this.db
      .prepare("UPDATE display_sync_queue SET sync_state = 'synced', last_error = NULL WHERE id = ?")
      .run(id);
  }

  recordAttempt(id: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE display_sync_queue
         SET attempt_count = attempt_count + 1, last_attempt_at = ?
         WHERE id = ?`,
      )
      .run(now, id);
  }

  markFailed(id: string, error: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE display_sync_queue SET sync_state = 'failed', last_error = ?,
         last_attempt_at = ? WHERE id = ?`,
      )
      .run(error, now, id);
  }

  markIrrecoverable(id: string, error: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE display_sync_queue SET sync_state = 'irrecoverable', last_error = ?,
         last_attempt_at = ? WHERE id = ?`,
      )
      .run(error, now, id);
  }

  markSyncedForEntityOperations(input: {
    entityId: string;
    operationTypes: string[];
  }): void {
    if (input.operationTypes.length === 0) {
      return;
    }
    const placeholders = input.operationTypes.map(() => "?").join(", ");
    this.db
      .prepare(
        `UPDATE display_sync_queue
         SET sync_state = 'synced', last_error = NULL
         WHERE entity_id = ? AND operation_type IN (${placeholders})
           AND sync_state IN ('pending', 'failed')`,
      )
      .run(input.entityId, ...input.operationTypes);
  }

  deduplicatePending(): number {
    const rows = this.listPending(1000);
    const keepIds = new Set<string>();
    const grouped = new Map<string, DisplaySyncQueueEntry[]>();

    for (const entry of rows) {
      const key = `${entry.operationType}:${entry.entityType}:${entry.entityId}`;
      const bucket = grouped.get(key) ?? [];
      bucket.push(entry);
      grouped.set(key, bucket);
    }

    for (const bucket of grouped.values()) {
      const sorted = [...bucket].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      keepIds.add(sorted[0]!.id);
      for (const duplicate of sorted.slice(1)) {
        this.markSynced(duplicate.id);
      }
    }

    return rows.length - keepIds.size;
  }

  repairPayloadProjectId(entityId: string, projectId: string): void {
    this.repairPayloadField(entityId, "projectId", projectId);
  }

  repairPayloadDisplayId(oldDisplayId: string, displayId: string): void {
    const rows = this.db
      .prepare(
        `SELECT id, payload_json FROM display_sync_queue
         WHERE sync_state IN ('pending', 'failed', 'irrecoverable')
           AND (
             entity_id = ?
             OR payload_json LIKE ?
           )`,
      )
      .all(oldDisplayId, `%\"displayId\":\"${oldDisplayId}\"%`) as Array<{
      id: string;
      payload_json: string;
    }>;

    for (const row of rows) {
      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(row.payload_json) as Record<string, unknown>;
      } catch {
        payload = {};
      }
      if (payload.displayId !== displayId) {
        payload.displayId = displayId;
        this.db
          .prepare("UPDATE display_sync_queue SET payload_json = ? WHERE id = ?")
          .run(JSON.stringify(payload), row.id);
      }
    }
  }

  shouldRetry(entry: DisplaySyncQueueEntry): boolean {
    return entry.attemptCount < MAX_QUEUE_ATTEMPTS;
  }

  getSummary(): DisplaySyncQueueSummary {
    const now = Date.now();
    const pendingDisplayRows = DISPLAY_OPERATION_TYPES.reduce(
      (count, operationType) => count + this.countByOperation(operationType),
      0,
    );
    const pendingRevisionRows = this.countByOperation("display.revision.create");
    const pendingTombstoneRows = this.countByOperation("display.delete");
    const failedDisplayRows = this.countFailedByOperation([...DISPLAY_OPERATION_TYPES]);
    const failedRevisionRows = this.countFailedByOperation(["display.revision.create"]);

    const oldest = this.db
      .prepare(
        `SELECT created_at FROM display_sync_queue
         WHERE sync_state IN ('pending', 'failed')
         ORDER BY created_at ASC LIMIT 1`,
      )
      .get() as { created_at: string } | undefined;

    const lastError = this.db
      .prepare(
        `SELECT last_error FROM display_sync_queue
         WHERE last_error IS NOT NULL
         ORDER BY last_attempt_at DESC NULLS LAST, created_at DESC
         LIMIT 1`,
      )
      .get() as { last_error: string } | undefined;

    return {
      pendingDisplayRows,
      pendingRevisionRows,
      pendingTombstoneRows,
      failedDisplayRows,
      failedRevisionRows,
      oldestPendingAt: oldest?.created_at ?? null,
      lastErrorCode: extractErrorCode(lastError?.last_error ?? null),
      eligibleNowCount: this.countEligiblePending(now),
      delayedRetryCount: this.countDelayedRetryPending(now),
    };
  }

  countByState(syncState: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS count FROM display_sync_queue WHERE sync_state = ?")
      .get(syncState) as { count: number | string } | undefined;
    return Number(row?.count ?? 0);
  }

  private repairPayloadField(entityId: string, field: string, value: string): void {
    const rows = this.db
      .prepare(
        `SELECT id, payload_json FROM display_sync_queue
         WHERE entity_id = ? AND sync_state IN ('pending', 'failed', 'irrecoverable')`,
      )
      .all(entityId) as Array<{ id: string; payload_json: string }>;

    for (const row of rows) {
      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(row.payload_json) as Record<string, unknown>;
      } catch {
        payload = {};
      }
      if (payload[field] === value) {
        continue;
      }
      payload[field] = value;
      this.db
        .prepare("UPDATE display_sync_queue SET payload_json = ? WHERE id = ?")
        .run(JSON.stringify(payload), row.id);
    }
  }

  private countByOperation(operationType: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS count FROM display_sync_queue
         WHERE operation_type = ? AND sync_state IN ('pending', 'failed')`,
      )
      .get(operationType) as { count: number | string } | undefined;
    return Number(row?.count ?? 0);
  }

  private countFailedByOperation(operationTypes: string[]): number {
    if (operationTypes.length === 0) {
      return 0;
    }
    const placeholders = operationTypes.map(() => "?").join(", ");
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS count FROM display_sync_queue
         WHERE operation_type IN (${placeholders}) AND sync_state = 'failed'`,
      )
      .get(...operationTypes) as { count: number | string } | undefined;
    return Number(row?.count ?? 0);
  }

  hasPendingOperation(entityId: string, operationType: string): boolean {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS count FROM display_sync_queue
         WHERE entity_id = ? AND operation_type = ?
           AND sync_state IN ('pending', 'failed')`,
      )
      .get(entityId, operationType) as { count: number | string } | undefined;
    return Number(row?.count ?? 0) > 0;
  }

  private findPendingDuplicate(
    entityType: string,
    entityId: string,
    operationType: string,
  ): DisplaySyncQueueEntry | null {
    const row = this.db
      .prepare(
        `SELECT * FROM display_sync_queue
         WHERE entity_type = ? AND entity_id = ? AND operation_type = ?
           AND sync_state IN ('pending', 'failed')
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(entityType, entityId, operationType) as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  }
}

function extractErrorCode(message: string | null): string | null {
  if (!message) {
    return null;
  }
  const match = message.match(/^([a-z0-9_]+):/i);
  return match?.[1] ?? null;
}

function mapRow(row: Record<string, unknown>): DisplaySyncQueueEntry {
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(String(row.payload_json ?? "{}")) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  return {
    id: String(row.id),
    entityType: String(row.entity_type),
    entityId: String(row.entity_id),
    operationType: String(row.operation_type),
    payload,
    createdAt: String(row.created_at),
    attemptCount: Number(row.attempt_count ?? 0),
    lastAttemptAt: typeof row.last_attempt_at === "string" ? row.last_attempt_at : null,
    lastError: typeof row.last_error === "string" ? row.last_error : null,
    syncState: String(row.sync_state ?? "pending"),
    sourceInstanceId: String(row.source_instance_id),
  };
}
