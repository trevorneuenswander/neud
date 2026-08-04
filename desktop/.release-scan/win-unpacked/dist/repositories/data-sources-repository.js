"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataSourcesRepository = void 0;
const crypto_1 = require("crypto");
const default_sources_1 = require("../bag/default-sources");
class DataSourcesRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    listByProject(projectId) {
        const rows = this.db
            .prepare("SELECT * FROM data_sources WHERE project_id = ? ORDER BY created_at ASC")
            .all(projectId);
        return rows.map(mapDataSourceRow);
    }
    getById(id) {
        const row = this.db
            .prepare("SELECT * FROM data_sources WHERE id = ?")
            .get(id);
        return row ? mapDataSourceRow(row) : null;
    }
    getByEngineKey(projectId, sourceKey) {
        const row = this.db
            .prepare("SELECT * FROM data_sources WHERE project_id = ? AND source_key = ?")
            .get(projectId, sourceKey);
        return row ? mapDataSourceRow(row) : null;
    }
    ensureWebpageScraper(projectId, projectType = "webpage-scraper") {
        const existing = this.getByEngineKey(projectId, "webpage-scraper");
        if (existing)
            return existing;
        return this.createWebpageScraper({ projectId, projectType });
    }
    createWebpageScraper(input) {
        const now = new Date().toISOString();
        const isBagProject = input.projectType === "bag-graphics";
        const source = {
            id: (0, crypto_1.randomUUID)(),
            projectId: input.projectId,
            name: input.name ?? "Webpage Scraper",
            sourceKey: input.sourceKey ?? "webpage-scraper",
            sourceType: "webpage-scraper",
            enabled: true,
            desiredState: "stopped",
            config: isBagProject
                ? { adapter: "bag-auction", execution_mode: "local-desktop" }
                : { adapter: "generic-webpage", execution_mode: "local-desktop", fields: [] },
            autoStart: false,
            createdAt: now,
            updatedAt: now,
        };
        this.db
            .prepare(`INSERT INTO data_sources (
          id, project_id, name, source_key, source_type, enabled,
          desired_state, config_json, auto_start, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(source.id, source.projectId, source.name, source.sourceKey, source.sourceType, source.enabled ? 1 : 0, source.desiredState, JSON.stringify(source.config), source.autoStart ? 1 : 0, source.createdAt, source.updatedAt);
        this.db
            .prepare(`INSERT INTO data_source_settings (
          source_id, poll_interval_ms, details_ttl_ms,
          max_detail_checks_per_poll, headless, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)`)
            .run(source.id, isBagProject ? default_sources_1.BAG_DEFAULT_POLL_INTERVAL_MS : 5000, default_sources_1.BAG_DEFAULT_DETAILS_TTL_MS, isBagProject ? default_sources_1.BAG_DEFAULT_MAX_DETAIL_CHECKS : 3, 1, now);
        this.db
            .prepare(`INSERT INTO data_source_status (
          source_id, actual_state, health_state, updated_at
        ) VALUES (?, 'stopped', 'unknown', ?)`)
            .run(source.id, now);
        return source;
    }
    updateDesiredState(id, desiredState) {
        const now = new Date().toISOString();
        this.db
            .prepare("UPDATE data_sources SET desired_state = ?, updated_at = ? WHERE id = ?")
            .run(desiredState, now, id);
    }
    updateConfig(id, config) {
        const now = new Date().toISOString();
        this.db
            .prepare("UPDATE data_sources SET config_json = ?, updated_at = ? WHERE id = ?")
            .run(JSON.stringify(config), now, id);
    }
    getSettings(sourceId) {
        const row = this.db
            .prepare("SELECT * FROM data_source_settings WHERE source_id = ?")
            .get(sourceId);
        if (!row)
            return null;
        return {
            sourceId: row.source_id,
            pollIntervalMs: row.poll_interval_ms,
            detailsTtlMs: row.details_ttl_ms,
            maxDetailChecksPerPoll: row.max_detail_checks_per_poll,
            headless: row.headless === 1,
            updatedAt: row.updated_at,
        };
    }
    updateSettings(sourceId, input) {
        const now = new Date().toISOString();
        this.db
            .prepare(`UPDATE data_source_settings SET
          poll_interval_ms = ?,
          details_ttl_ms = ?,
          max_detail_checks_per_poll = ?,
          headless = ?,
          updated_at = ?
        WHERE source_id = ?`)
            .run(input.pollIntervalMs, input.detailsTtlMs, input.maxDetailChecksPerPoll, input.headless ? 1 : 0, now, sourceId);
    }
    listSources(sourceId, enabledOnly = false) {
        const sql = enabledOnly
            ? "SELECT * FROM data_source_sources WHERE source_id = ? AND enabled = 1 ORDER BY position ASC"
            : "SELECT * FROM data_source_sources WHERE source_id = ? ORDER BY position ASC";
        const rows = this.db.prepare(sql).all(sourceId);
        return rows.map(mapScraperSourceRow);
    }
    getSourceByKey(sourceId, sourceKey) {
        const row = this.db
            .prepare("SELECT * FROM data_source_sources WHERE source_id = ? AND source_key = ?")
            .get(sourceId, sourceKey);
        return row ? mapScraperSourceRow(row) : null;
    }
    saveSource(sourceId, input) {
        const now = new Date().toISOString();
        const configJson = JSON.stringify(input.config ?? {});
        if (input.id) {
            this.db
                .prepare(`UPDATE data_source_sources SET
            name = ?, source_key = ?, url = ?, page_type = ?,
            enabled = ?, position = ?, config_json = ?, updated_at = ?
          WHERE id = ? AND source_id = ?`)
                .run(input.name, input.sourceKey, input.url, input.pageType, input.enabled ? 1 : 0, input.position, configJson, now, input.id, sourceId);
            return this.getSourceById(input.id);
        }
        const id = (0, crypto_1.randomUUID)();
        this.db
            .prepare(`INSERT INTO data_source_sources (
          id, source_id, name, source_key, url, page_type, enabled, position,
          config_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(id, sourceId, input.name, input.sourceKey, input.url, input.pageType, input.enabled ? 1 : 0, input.position, configJson, now, now);
        return this.getSourceById(id);
    }
    reorderSources(sourceId, orderedSourceIds) {
        const now = new Date().toISOString();
        orderedSourceIds.forEach((id, index) => {
            this.db
                .prepare("UPDATE data_source_sources SET position = ?, updated_at = ? WHERE id = ? AND source_id = ?")
                .run((index + 1) * 10, now, id, sourceId);
        });
    }
    getSourceById(id) {
        const row = this.db
            .prepare("SELECT * FROM data_source_sources WHERE id = ?")
            .get(id);
        return row ? mapScraperSourceRow(row) : null;
    }
    toggleSource(sourceId, id, enabled) {
        const now = new Date().toISOString();
        this.db
            .prepare("UPDATE data_source_sources SET enabled = ?, updated_at = ? WHERE id = ? AND source_id = ?")
            .run(enabled ? 1 : 0, now, id, sourceId);
    }
    removeSource(sourceId, id) {
        this.db
            .prepare("DELETE FROM data_source_sources WHERE id = ? AND source_id = ?")
            .run(id, sourceId);
    }
    getStatus(sourceId) {
        const row = this.db
            .prepare("SELECT * FROM data_source_status WHERE source_id = ?")
            .get(sourceId);
        if (!row)
            return null;
        return {
            sourceId: row.source_id,
            actualState: row.actual_state,
            healthState: row.health_state,
            workerId: row.worker_id,
            lastHeartbeatAt: row.last_heartbeat_at,
            lastRunAt: row.last_run_at,
            lastSuccessAt: row.last_success_at,
            lastError: row.last_error,
            runCount: row.run_count,
            successCount: row.success_count,
            failureCount: row.failure_count,
            lastDurationMs: row.last_duration_ms ?? null,
            lastRecordCount: row.last_record_count ?? null,
            lastPayloadSizeBytes: row.last_payload_size_bytes ?? null,
            lastRunFailedAt: row.last_run_failed_at ?? null,
            scrapesToday: row.scrapes_today ?? 0,
            successfulToday: row.successful_today ?? 0,
            failedToday: row.failed_today ?? 0,
            statsDay: row.stats_day ?? null,
            updatedAt: row.updated_at,
        };
    }
    upsertStatus(sourceId, patch) {
        const current = this.getStatus(sourceId);
        const now = new Date().toISOString();
        const next = {
            actualState: patch.actualState ?? current?.actualState ?? "stopped",
            healthState: patch.healthState ?? current?.healthState ?? "unknown",
            workerId: patch.workerId ?? current?.workerId ?? null,
            lastHeartbeatAt: patch.lastHeartbeatAt ?? current?.lastHeartbeatAt ?? null,
            lastRunAt: patch.lastRunAt ?? current?.lastRunAt ?? null,
            lastSuccessAt: patch.lastSuccessAt ?? current?.lastSuccessAt ?? null,
            lastError: patch.lastError ?? current?.lastError ?? null,
            runCount: patch.runCount ?? current?.runCount ?? 0,
            successCount: patch.successCount ?? current?.successCount ?? 0,
            failureCount: patch.failureCount ?? current?.failureCount ?? 0,
            lastDurationMs: patch.lastDurationMs ?? current?.lastDurationMs ?? null,
            lastRecordCount: patch.lastRecordCount ?? current?.lastRecordCount ?? null,
            lastPayloadSizeBytes: patch.lastPayloadSizeBytes ?? current?.lastPayloadSizeBytes ?? null,
            lastRunFailedAt: patch.lastRunFailedAt ?? current?.lastRunFailedAt ?? null,
            scrapesToday: patch.scrapesToday ?? current?.scrapesToday ?? 0,
            successfulToday: patch.successfulToday ?? current?.successfulToday ?? 0,
            failedToday: patch.failedToday ?? current?.failedToday ?? 0,
            statsDay: patch.statsDay ?? current?.statsDay ?? null,
            updatedAt: now,
        };
        if (!current) {
            this.db
                .prepare(`INSERT INTO data_source_status (
            source_id, actual_state, health_state, worker_id, last_heartbeat_at,
            last_run_at, last_success_at, last_error, run_count, success_count,
            failure_count, last_duration_ms, last_record_count, last_payload_size_bytes,
            last_run_failed_at, scrapes_today, successful_today, failed_today, stats_day,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                .run(sourceId, next.actualState, next.healthState, next.workerId, next.lastHeartbeatAt, next.lastRunAt, next.lastSuccessAt, next.lastError, next.runCount, next.successCount, next.failureCount, next.lastDurationMs, next.lastRecordCount, next.lastPayloadSizeBytes, next.lastRunFailedAt, next.scrapesToday, next.successfulToday, next.failedToday, next.statsDay, next.updatedAt);
            return;
        }
        this.db
            .prepare(`UPDATE data_source_status SET
          actual_state = ?, health_state = ?, worker_id = ?, last_heartbeat_at = ?,
          last_run_at = ?, last_success_at = ?, last_error = ?, run_count = ?,
          success_count = ?, failure_count = ?, last_duration_ms = ?,
          last_record_count = ?, last_payload_size_bytes = ?, last_run_failed_at = ?,
          scrapes_today = ?, successful_today = ?, failed_today = ?, stats_day = ?,
          updated_at = ?
        WHERE source_id = ?`)
            .run(next.actualState, next.healthState, next.workerId, next.lastHeartbeatAt, next.lastRunAt, next.lastSuccessAt, next.lastError, next.runCount, next.successCount, next.failureCount, next.lastDurationMs, next.lastRecordCount, next.lastPayloadSizeBytes, next.lastRunFailedAt, next.scrapesToday, next.successfulToday, next.failedToday, next.statsDay, next.updatedAt, sourceId);
    }
    insertSnapshot(sourceId, input) {
        const now = new Date().toISOString();
        const snapshot = {
            id: (0, crypto_1.randomUUID)(),
            sourceId,
            data: input.data,
            recordCount: input.recordCount ?? null,
            payloadSizeBytes: input.payloadSizeBytes ?? null,
            durationMs: input.durationMs ?? null,
            capturedAt: input.capturedAt ?? now,
            createdAt: now,
        };
        this.db
            .prepare(`INSERT INTO data_source_snapshots (
          id, source_id, data_json, record_count, payload_size_bytes,
          duration_ms, captured_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(snapshot.id, snapshot.sourceId, JSON.stringify(snapshot.data), snapshot.recordCount, snapshot.payloadSizeBytes, snapshot.durationMs, snapshot.capturedAt, snapshot.createdAt);
        this.pruneSnapshots(sourceId, 100);
        return snapshot;
    }
    getLatestSnapshot(sourceId) {
        const row = this.db
            .prepare("SELECT * FROM data_source_snapshots WHERE source_id = ? ORDER BY captured_at DESC LIMIT 1")
            .get(sourceId);
        return row ? mapSnapshotRow(row) : null;
    }
    getRecentSnapshots(sourceId, limit = 100) {
        const rows = this.db
            .prepare("SELECT * FROM data_source_snapshots WHERE source_id = ? ORDER BY captured_at DESC LIMIT ?")
            .all(sourceId, limit);
        return rows.map(mapSnapshotRow);
    }
    insertLog(sourceId, input) {
        const now = new Date().toISOString();
        this.db
            .prepare(`INSERT INTO data_source_logs (
          source_id, level, event_type, message, metadata_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`)
            .run(sourceId, input.level, input.eventType ?? null, input.message, JSON.stringify(input.metadata ?? {}), now);
        const row = this.db
            .prepare("SELECT * FROM data_source_logs WHERE source_id = ? ORDER BY id DESC LIMIT 1")
            .get(sourceId);
        this.pruneLogs(sourceId, 500);
        return mapLogRow(row);
    }
    getLogs(sourceId, level, limit = 500) {
        const rows = level && level !== "all"
            ? this.db
                .prepare(`SELECT * FROM data_source_logs WHERE source_id = ? AND level = ?
             ORDER BY created_at DESC LIMIT ?`)
                .all(sourceId, level, limit)
            : this.db
                .prepare("SELECT * FROM data_source_logs WHERE source_id = ? ORDER BY created_at DESC LIMIT ?")
                .all(sourceId, limit);
        return rows.map(mapLogRow);
    }
    pruneSnapshots(sourceId, keep) {
        const rows = this.db
            .prepare("SELECT id FROM data_source_snapshots WHERE source_id = ? ORDER BY captured_at DESC")
            .all(sourceId);
        for (const row of rows.slice(keep)) {
            this.db
                .prepare("DELETE FROM data_source_snapshots WHERE id = ?")
                .run(row.id);
        }
    }
    pruneLogs(sourceId, keep) {
        const rows = this.db
            .prepare("SELECT id FROM data_source_logs WHERE source_id = ? ORDER BY created_at DESC")
            .all(sourceId);
        for (const row of rows.slice(keep)) {
            this.db
                .prepare("DELETE FROM data_source_logs WHERE id = ?")
                .run(row.id);
        }
    }
}
exports.DataSourcesRepository = DataSourcesRepository;
function mapDataSourceRow(row) {
    return {
        id: row.id,
        projectId: row.project_id,
        name: row.name,
        sourceKey: row.source_key,
        sourceType: row.source_type,
        enabled: row.enabled === 1,
        desiredState: row.desired_state === "running" ? "running" : "stopped",
        config: parseJsonObject(row.config_json),
        autoStart: row.auto_start === 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
function mapScraperSourceRow(row) {
    return {
        id: row.id,
        sourceId: row.source_id,
        name: row.name,
        sourceKey: row.source_key,
        url: row.url,
        pageType: row.page_type,
        enabled: row.enabled === 1,
        position: row.position,
        config: parseJsonObject(row.config_json),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
function mapSnapshotRow(row) {
    return {
        id: row.id,
        sourceId: row.source_id,
        data: parseJsonObject(row.data_json),
        recordCount: row.record_count,
        payloadSizeBytes: row.payload_size_bytes,
        durationMs: row.duration_ms,
        capturedAt: row.captured_at,
        createdAt: row.created_at,
    };
}
function mapLogRow(row) {
    return {
        id: row.id,
        sourceId: row.source_id,
        level: row.level,
        eventType: row.event_type,
        message: row.message,
        metadata: parseJsonObject(row.metadata_json),
        createdAt: row.created_at,
    };
}
function parseJsonObject(value) {
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? parsed
            : {};
    }
    catch {
        return {};
    }
}
