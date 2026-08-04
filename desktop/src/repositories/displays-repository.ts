import { randomUUID } from "crypto";
import type { LocalDatabase } from "../database/connection";
import {
  DEFAULT_DISPLAY_HEIGHT,
  DEFAULT_DISPLAY_WIDTH,
  normalizeDisplaySize,
} from "../displays/display-size";

export type LocalDisplay = {
  id: string;
  projectId: string;
  name: string;
  displayKey: string;
  htmlPath: string | null;
  settings: Record<string, unknown>;
  enabled: boolean;
  refreshRateMs: number;
  displayWidth: number;
  displayHeight: number;
  sortOrder: number | null;
  syncStatus: string;
  syncAttemptCount: number;
  lastSyncAttemptAt: string | null;
  syncedAt: string | null;
  syncError: string | null;
  syncVersion: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type DisplayRow = {
  id: string;
  project_id: string;
  name: string;
  display_key: string;
  html_path: string | null;
  settings_json: string;
  enabled: number;
  refresh_rate_ms: number;
  display_width: number | null;
  display_height: number | null;
  sort_order: number | null;
  sync_status: string | null;
  sync_attempt_count: number | null;
  last_sync_attempt_at: string | null;
  synced_at: string | null;
  sync_error: string | null;
  sync_version: number | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export class DisplaysRepository {
  constructor(private readonly db: LocalDatabase) {}

  listByProject(projectId: string): LocalDisplay[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM displays
         WHERE project_id = ?
           AND deleted_at IS NULL
         ORDER BY COALESCE(sort_order, 999999) ASC, created_at ASC`,
      )
      .all(projectId) as DisplayRow[];
    return rows.map(mapDisplayRow);
  }

  countActiveForProjects(projectIds: string[]): number {
    if (projectIds.length === 0) {
      return 0;
    }

    const placeholders = projectIds.map(() => "?").join(", ");
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM displays d
         LEFT JOIN project_display_code pdc ON pdc.display_id = d.id
         WHERE d.project_id IN (${placeholders})
           AND d.enabled = 1
           AND d.deleted_at IS NULL
           AND COALESCE(pdc.archived, 0) = 0`,
      )
      .get(...projectIds) as { count: number | string } | undefined;

    return Number(row?.count ?? 0);
  }

  getNextSortOrder(projectId: string): number {
    const row = this.db
      .prepare(
        "SELECT MAX(sort_order) AS max_order FROM displays WHERE project_id = ? AND deleted_at IS NULL",
      )
      .get(projectId) as { max_order: number | null } | undefined;
    return (row?.max_order ?? 0) + 1;
  }

  reorderProjectDisplays(projectId: string, displayKeys: string[]): void {
    const rows = this.listByProject(projectId);
    const byKey = new Map(rows.map((row) => [row.displayKey, row]));
    const now = new Date().toISOString();
    const update = this.db.prepare(
      "UPDATE displays SET sort_order = ?, updated_at = ?, sync_status = 'pending', sync_version = sync_version + 1 WHERE id = ? AND project_id = ?",
    );
    displayKeys.forEach((displayKey, index) => {
      const row = byKey.get(displayKey);
      if (!row) return;
      update.run(index + 1, now, row.id, projectId);
    });
  }

  getById(displayId: string): LocalDisplay | null {
    const row = this.db
      .prepare("SELECT * FROM displays WHERE id = ? AND deleted_at IS NULL")
      .get(displayId) as DisplayRow | undefined;
    return row ? mapDisplayRow(row) : null;
  }

  getByKey(projectId: string, displayKey: string): LocalDisplay | null {
    const row = this.db
      .prepare(
        "SELECT * FROM displays WHERE project_id = ? AND display_key = ? AND deleted_at IS NULL",
      )
      .get(projectId, displayKey) as DisplayRow | undefined;
    return row ? mapDisplayRow(row) : null;
  }

  upsert(input: {
    projectId: string;
    name: string;
    displayKey: string;
    htmlPath?: string | null;
    settings?: Record<string, unknown>;
    enabled?: boolean;
    refreshRateMs?: number;
    displayWidth?: number;
    displayHeight?: number;
    sortOrder?: number;
  }): LocalDisplay {
    const now = new Date().toISOString();
    const existing = this.getByKey(input.projectId, input.displayKey);
    const size = normalizeDisplaySize(input.displayWidth, input.displayHeight);

    if (!existing) {
      const sortOrder = input.sortOrder ?? this.getNextSortOrder(input.projectId);
      const display: LocalDisplay = {
        id: randomUUID(),
        projectId: input.projectId,
        name: input.name,
        displayKey: input.displayKey,
        htmlPath: input.htmlPath ?? null,
        settings: input.settings ?? {},
        enabled: input.enabled ?? true,
        refreshRateMs: input.refreshRateMs ?? 5000,
        displayWidth: size.displayWidth,
        displayHeight: size.displayHeight,
        sortOrder,
        syncStatus: "pending",
        syncAttemptCount: 0,
        lastSyncAttemptAt: null,
        syncedAt: null,
        syncError: null,
        syncVersion: 1,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      };

      this.db
        .prepare(
          `INSERT INTO displays (
            id, project_id, name, display_key, html_path, settings_json,
            enabled, refresh_rate_ms, display_width, display_height, sort_order,
            sync_status, sync_attempt_count, sync_version, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          display.id,
          display.projectId,
          display.name,
          display.displayKey,
          display.htmlPath,
          JSON.stringify(display.settings),
          display.enabled ? 1 : 0,
          display.refreshRateMs,
          display.displayWidth,
          display.displayHeight,
          display.sortOrder,
          display.syncStatus,
          display.syncAttemptCount,
          display.syncVersion,
          display.createdAt,
          display.updatedAt,
        );

      return display;
    }

    const next: LocalDisplay = {
      ...existing,
      name: input.name,
      htmlPath: input.htmlPath ?? existing.htmlPath,
      settings: input.settings ?? existing.settings,
      enabled: input.enabled ?? existing.enabled,
      refreshRateMs: input.refreshRateMs ?? existing.refreshRateMs,
      displayWidth: input.displayWidth ?? existing.displayWidth,
      displayHeight: input.displayHeight ?? existing.displayHeight,
      syncStatus: "pending",
      syncVersion: existing.syncVersion + 1,
      updatedAt: now,
    };

    this.db
      .prepare(
        `UPDATE displays SET
          name = ?,
          html_path = ?,
          settings_json = ?,
          enabled = ?,
          refresh_rate_ms = ?,
          display_width = ?,
          display_height = ?,
          sync_status = ?,
          sync_version = ?,
          updated_at = ?
        WHERE id = ?`,
      )
      .run(
        next.name,
        next.htmlPath,
        JSON.stringify(next.settings),
        next.enabled ? 1 : 0,
        next.refreshRateMs,
        next.displayWidth,
        next.displayHeight,
        next.syncStatus,
        next.syncVersion,
        next.updatedAt,
        next.id,
      );

    return next;
  }

  updateName(displayId: string, name: string): LocalDisplay | null {
    const existing = this.getById(displayId);
    if (!existing) {
      return null;
    }

    const now = new Date().toISOString();
    this.db
      .prepare(
        "UPDATE displays SET name = ?, updated_at = ?, sync_status = 'pending', sync_version = sync_version + 1 WHERE id = ?",
      )
      .run(name, now, displayId);

    return {
      ...existing,
      name,
      syncStatus: "pending",
      syncVersion: existing.syncVersion + 1,
      updatedAt: now,
    };
  }

  setEnabled(displayId: string, enabled: boolean): LocalDisplay | null {
    const existing = this.getById(displayId);
    if (!existing) {
      return null;
    }

    const now = new Date().toISOString();
    this.db
      .prepare(
        "UPDATE displays SET enabled = ?, updated_at = ?, sync_status = 'pending', sync_version = sync_version + 1 WHERE id = ?",
      )
      .run(enabled ? 1 : 0, now, displayId);

    return {
      ...existing,
      enabled,
      syncStatus: "pending",
      syncVersion: existing.syncVersion + 1,
      updatedAt: now,
    };
  }

  setRefreshRateMs(displayId: string, refreshRateMs: number): LocalDisplay | null {
    const existing = this.getById(displayId);
    if (!existing) {
      return null;
    }

    const now = new Date().toISOString();
    this.db
      .prepare(
        "UPDATE displays SET refresh_rate_ms = ?, updated_at = ?, sync_status = 'pending', sync_version = sync_version + 1 WHERE id = ?",
      )
      .run(refreshRateMs, now, displayId);

    return {
      ...existing,
      refreshRateMs,
      syncStatus: "pending",
      syncVersion: existing.syncVersion + 1,
      updatedAt: now,
    };
  }

  setDisplaySize(displayId: string, displayWidth: number, displayHeight: number): LocalDisplay | null {
    const existing = this.getById(displayId);
    if (!existing) {
      return null;
    }

    const size = normalizeDisplaySize(displayWidth, displayHeight);
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE displays SET display_width = ?, display_height = ?, updated_at = ?,
         sync_status = 'pending', sync_version = sync_version + 1 WHERE id = ?`,
      )
      .run(size.displayWidth, size.displayHeight, now, displayId);

    return {
      ...existing,
      displayWidth: size.displayWidth,
      displayHeight: size.displayHeight,
      syncStatus: "pending",
      syncVersion: existing.syncVersion + 1,
      updatedAt: now,
    };
  }

  markSynced(displayId: string, syncedAt: string): void {
    this.db
      .prepare(
        `UPDATE displays SET sync_status = 'synced', synced_at = ?, sync_error = NULL WHERE id = ?`,
      )
      .run(syncedAt, displayId);
  }

  markSyncPending(displayId: string): void {
    this.db
      .prepare(
        `UPDATE displays SET sync_status = 'pending', sync_version = sync_version + 1, updated_at = ? WHERE id = ?`,
      )
      .run(new Date().toISOString(), displayId);
  }

  markSyncFailed(displayId: string, error: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE displays SET sync_status = 'failed', sync_error = ?,
         sync_attempt_count = sync_attempt_count + 1, last_sync_attempt_at = ? WHERE id = ?`,
      )
      .run(error, now, displayId);
  }

  listPendingSync(limit = 100): LocalDisplay[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM displays
         WHERE deleted_at IS NULL AND sync_status IN ('pending', 'failed')
         ORDER BY updated_at ASC
         LIMIT ?`,
      )
      .all(limit) as DisplayRow[];
    return rows.map(mapDisplayRow);
  }

  deleteById(displayId: string): boolean {
    const existing = this.getById(displayId);
    if (!existing) {
      return false;
    }
    this.db.prepare("DELETE FROM displays WHERE id = ?").run(displayId);
    return true;
  }

  /** Align local SQLite display identity to an existing hosted display row (same slug). */
  realignDisplayId(localDisplayId: string, hostedDisplayId: string): void {
    if (localDisplayId === hostedDisplayId) {
      return;
    }
    if (!this.getById(localDisplayId)) {
      throw new Error("Local display not found for identity realignment.");
    }
    if (this.getById(hostedDisplayId)) {
      throw new Error("Target hosted display id already exists locally.");
    }

    this.db.transaction(() => {
      this.db.exec("PRAGMA foreign_keys = OFF");
      this.db
        .prepare("UPDATE project_display_code SET display_id = ? WHERE display_id = ?")
        .run(hostedDisplayId, localDisplayId);
      this.db
        .prepare(
          `UPDATE project_code_revisions
           SET resource_id = ?
           WHERE resource_type = 'display' AND resource_id = ?`,
        )
        .run(hostedDisplayId, localDisplayId);
      this.db
        .prepare(
          "UPDATE display_sync_queue SET entity_id = ? WHERE entity_id = ? AND entity_type IN ('display', 'display_revision')",
        )
        .run(hostedDisplayId, localDisplayId);
      this.db
        .prepare("UPDATE display_deletion_tombstones SET display_id = ? WHERE display_id = ?")
        .run(hostedDisplayId, localDisplayId);
      this.db
        .prepare("UPDATE user_display_order SET display_id = ? WHERE display_id = ?")
        .run(hostedDisplayId, localDisplayId);
      this.db
        .prepare("UPDATE display_settings SET display_id = ? WHERE display_id = ?")
        .run(hostedDisplayId, localDisplayId);
      this.db
        .prepare("UPDATE displays SET id = ? WHERE id = ?")
        .run(hostedDisplayId, localDisplayId);
      this.db.exec("PRAGMA foreign_keys = ON");
    });
  }
}

function mapDisplayRow(row: DisplayRow): LocalDisplay {
  let settings: Record<string, unknown> = {};
  try {
    settings = JSON.parse(row.settings_json) as Record<string, unknown>;
  } catch {
    settings = {};
  }

  const size = normalizeDisplaySize(row.display_width, row.display_height);

  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    displayKey: row.display_key,
    htmlPath: row.html_path,
    settings,
    enabled: row.enabled === 1,
    refreshRateMs: row.refresh_rate_ms ?? 5000,
    displayWidth: size.displayWidth,
    displayHeight: size.displayHeight,
    sortOrder: row.sort_order ?? null,
    syncStatus: row.sync_status ?? "pending",
    syncAttemptCount: row.sync_attempt_count ?? 0,
    lastSyncAttemptAt: row.last_sync_attempt_at ?? null,
    syncedAt: row.synced_at ?? null,
    syncError: row.sync_error ?? null,
    syncVersion: row.sync_version ?? 1,
    deletedAt: row.deleted_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export { DEFAULT_DISPLAY_WIDTH, DEFAULT_DISPLAY_HEIGHT };
