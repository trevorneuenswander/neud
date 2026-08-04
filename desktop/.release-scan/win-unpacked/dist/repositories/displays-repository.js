"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_DISPLAY_HEIGHT = exports.DEFAULT_DISPLAY_WIDTH = exports.DisplaysRepository = void 0;
const crypto_1 = require("crypto");
const display_size_1 = require("../displays/display-size");
Object.defineProperty(exports, "DEFAULT_DISPLAY_HEIGHT", { enumerable: true, get: function () { return display_size_1.DEFAULT_DISPLAY_HEIGHT; } });
Object.defineProperty(exports, "DEFAULT_DISPLAY_WIDTH", { enumerable: true, get: function () { return display_size_1.DEFAULT_DISPLAY_WIDTH; } });
class DisplaysRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    listByProject(projectId) {
        const rows = this.db
            .prepare(`SELECT * FROM displays
         WHERE project_id = ?
           AND deleted_at IS NULL
         ORDER BY COALESCE(sort_order, 999999) ASC, created_at ASC`)
            .all(projectId);
        return rows.map(mapDisplayRow);
    }
    countActiveForProjects(projectIds) {
        if (projectIds.length === 0) {
            return 0;
        }
        const placeholders = projectIds.map(() => "?").join(", ");
        const row = this.db
            .prepare(`SELECT COUNT(*) AS count
         FROM displays d
         LEFT JOIN project_display_code pdc ON pdc.display_id = d.id
         WHERE d.project_id IN (${placeholders})
           AND d.enabled = 1
           AND d.deleted_at IS NULL
           AND COALESCE(pdc.archived, 0) = 0`)
            .get(...projectIds);
        return Number(row?.count ?? 0);
    }
    getNextSortOrder(projectId) {
        const row = this.db
            .prepare("SELECT MAX(sort_order) AS max_order FROM displays WHERE project_id = ? AND deleted_at IS NULL")
            .get(projectId);
        return (row?.max_order ?? 0) + 1;
    }
    reorderProjectDisplays(projectId, displayKeys) {
        const rows = this.listByProject(projectId);
        const byKey = new Map(rows.map((row) => [row.displayKey, row]));
        const now = new Date().toISOString();
        const update = this.db.prepare("UPDATE displays SET sort_order = ?, updated_at = ?, sync_status = 'pending', sync_version = sync_version + 1 WHERE id = ? AND project_id = ?");
        displayKeys.forEach((displayKey, index) => {
            const row = byKey.get(displayKey);
            if (!row)
                return;
            update.run(index + 1, now, row.id, projectId);
        });
    }
    getById(displayId) {
        const row = this.db
            .prepare("SELECT * FROM displays WHERE id = ? AND deleted_at IS NULL")
            .get(displayId);
        return row ? mapDisplayRow(row) : null;
    }
    getByKey(projectId, displayKey) {
        const row = this.db
            .prepare("SELECT * FROM displays WHERE project_id = ? AND display_key = ? AND deleted_at IS NULL")
            .get(projectId, displayKey);
        return row ? mapDisplayRow(row) : null;
    }
    upsert(input) {
        const now = new Date().toISOString();
        const existing = this.getByKey(input.projectId, input.displayKey);
        const size = (0, display_size_1.normalizeDisplaySize)(input.displayWidth, input.displayHeight);
        if (!existing) {
            const sortOrder = input.sortOrder ?? this.getNextSortOrder(input.projectId);
            const display = {
                id: (0, crypto_1.randomUUID)(),
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
                .prepare(`INSERT INTO displays (
            id, project_id, name, display_key, html_path, settings_json,
            enabled, refresh_rate_ms, display_width, display_height, sort_order,
            sync_status, sync_attempt_count, sync_version, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                .run(display.id, display.projectId, display.name, display.displayKey, display.htmlPath, JSON.stringify(display.settings), display.enabled ? 1 : 0, display.refreshRateMs, display.displayWidth, display.displayHeight, display.sortOrder, display.syncStatus, display.syncAttemptCount, display.syncVersion, display.createdAt, display.updatedAt);
            return display;
        }
        const next = {
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
            .prepare(`UPDATE displays SET
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
        WHERE id = ?`)
            .run(next.name, next.htmlPath, JSON.stringify(next.settings), next.enabled ? 1 : 0, next.refreshRateMs, next.displayWidth, next.displayHeight, next.syncStatus, next.syncVersion, next.updatedAt, next.id);
        return next;
    }
    updateName(displayId, name) {
        const existing = this.getById(displayId);
        if (!existing) {
            return null;
        }
        const now = new Date().toISOString();
        this.db
            .prepare("UPDATE displays SET name = ?, updated_at = ?, sync_status = 'pending', sync_version = sync_version + 1 WHERE id = ?")
            .run(name, now, displayId);
        return {
            ...existing,
            name,
            syncStatus: "pending",
            syncVersion: existing.syncVersion + 1,
            updatedAt: now,
        };
    }
    setEnabled(displayId, enabled) {
        const existing = this.getById(displayId);
        if (!existing) {
            return null;
        }
        const now = new Date().toISOString();
        this.db
            .prepare("UPDATE displays SET enabled = ?, updated_at = ?, sync_status = 'pending', sync_version = sync_version + 1 WHERE id = ?")
            .run(enabled ? 1 : 0, now, displayId);
        return {
            ...existing,
            enabled,
            syncStatus: "pending",
            syncVersion: existing.syncVersion + 1,
            updatedAt: now,
        };
    }
    setRefreshRateMs(displayId, refreshRateMs) {
        const existing = this.getById(displayId);
        if (!existing) {
            return null;
        }
        const now = new Date().toISOString();
        this.db
            .prepare("UPDATE displays SET refresh_rate_ms = ?, updated_at = ?, sync_status = 'pending', sync_version = sync_version + 1 WHERE id = ?")
            .run(refreshRateMs, now, displayId);
        return {
            ...existing,
            refreshRateMs,
            syncStatus: "pending",
            syncVersion: existing.syncVersion + 1,
            updatedAt: now,
        };
    }
    setDisplaySize(displayId, displayWidth, displayHeight) {
        const existing = this.getById(displayId);
        if (!existing) {
            return null;
        }
        const size = (0, display_size_1.normalizeDisplaySize)(displayWidth, displayHeight);
        const now = new Date().toISOString();
        this.db
            .prepare(`UPDATE displays SET display_width = ?, display_height = ?, updated_at = ?,
         sync_status = 'pending', sync_version = sync_version + 1 WHERE id = ?`)
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
    markSynced(displayId, syncedAt) {
        this.db
            .prepare(`UPDATE displays SET sync_status = 'synced', synced_at = ?, sync_error = NULL WHERE id = ?`)
            .run(syncedAt, displayId);
    }
    markSyncFailed(displayId, error) {
        const now = new Date().toISOString();
        this.db
            .prepare(`UPDATE displays SET sync_status = 'failed', sync_error = ?,
         sync_attempt_count = sync_attempt_count + 1, last_sync_attempt_at = ? WHERE id = ?`)
            .run(error, now, displayId);
    }
    listPendingSync(limit = 100) {
        const rows = this.db
            .prepare(`SELECT * FROM displays
         WHERE deleted_at IS NULL AND sync_status IN ('pending', 'failed')
         ORDER BY updated_at ASC
         LIMIT ?`)
            .all(limit);
        return rows.map(mapDisplayRow);
    }
    deleteById(displayId) {
        const existing = this.getById(displayId);
        if (!existing) {
            return false;
        }
        this.db.prepare("DELETE FROM displays WHERE id = ?").run(displayId);
        return true;
    }
}
exports.DisplaysRepository = DisplaysRepository;
function mapDisplayRow(row) {
    let settings = {};
    try {
        settings = JSON.parse(row.settings_json);
    }
    catch {
        settings = {};
    }
    const size = (0, display_size_1.normalizeDisplaySize)(row.display_width, row.display_height);
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
