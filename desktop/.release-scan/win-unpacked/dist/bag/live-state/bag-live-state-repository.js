"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BagLiveStateRepository = void 0;
exports.parseBagLiveState = parseBagLiveState;
const lot_photo_overrides_1 = require("./lot-photo-overrides");
const bag_live_state_types_1 = require("./bag-live-state-types");
class BagLiveStateRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    get(projectId) {
        const row = this.db
            .prepare("SELECT * FROM bag_live_state WHERE project_id = ?")
            .get(projectId);
        return row ? mapRow(row) : null;
    }
    upsert(input) {
        const now = new Date().toISOString();
        const existing = this.get(input.projectId);
        if (!existing) {
            this.db
                .prepare(`INSERT INTO bag_live_state (
            project_id, engine_id, schema_version, mode, state_json,
            automatic_state_json, manual_state_json, manual_started_at,
            manual_started_by, source_snapshot_id,
            latest_scraped_current_lot_json, local_controller_draft_json,
            local_controller_submitted_json, manual_lot_navigation_json,
            lot_photo_overrides_json, updated_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                .run(input.projectId, input.engineId, input.state.schemaVersion, input.state.mode, JSON.stringify(input.state), input.automaticState ? JSON.stringify(input.automaticState) : null, input.manualState ? JSON.stringify(input.manualState) : null, input.manualStartedAt ?? null, input.manualStartedBy ?? null, input.sourceSnapshotId ?? null, input.latestScrapedCurrentLot
                ? JSON.stringify(input.latestScrapedCurrentLot)
                : null, input.localControllerDraft
                ? JSON.stringify(input.localControllerDraft)
                : null, input.localControllerSubmitted
                ? JSON.stringify(input.localControllerSubmitted)
                : null, input.manualLotNavigation
                ? JSON.stringify(input.manualLotNavigation)
                : null, JSON.stringify(input.lotPhotoOverrides ?? {}), input.state.updatedAt ?? now, now);
        }
        else {
            this.db
                .prepare(`UPDATE bag_live_state SET
            engine_id = ?,
            schema_version = ?,
            mode = ?,
            state_json = ?,
            automatic_state_json = ?,
            manual_state_json = ?,
            manual_started_at = ?,
            manual_started_by = ?,
            source_snapshot_id = ?,
            latest_scraped_current_lot_json = ?,
            local_controller_draft_json = ?,
            local_controller_submitted_json = ?,
            manual_lot_navigation_json = ?,
            lot_photo_overrides_json = ?,
            updated_at = ?
          WHERE project_id = ?`)
                .run(input.engineId, input.state.schemaVersion, input.state.mode, JSON.stringify(input.state), input.automaticState !== undefined
                ? input.automaticState
                    ? JSON.stringify(input.automaticState)
                    : null
                : existing.automaticState
                    ? JSON.stringify(existing.automaticState)
                    : null, input.manualState !== undefined
                ? input.manualState
                    ? JSON.stringify(input.manualState)
                    : null
                : existing.manualState
                    ? JSON.stringify(existing.manualState)
                    : null, input.manualStartedAt !== undefined
                ? input.manualStartedAt
                : existing.manualStartedAt, input.manualStartedBy !== undefined
                ? input.manualStartedBy
                : existing.manualStartedBy, input.sourceSnapshotId ?? existing.sourceSnapshotId, input.latestScrapedCurrentLot !== undefined
                ? input.latestScrapedCurrentLot
                    ? JSON.stringify(input.latestScrapedCurrentLot)
                    : null
                : existing.latestScrapedCurrentLot
                    ? JSON.stringify(existing.latestScrapedCurrentLot)
                    : null, input.localControllerDraft !== undefined
                ? input.localControllerDraft
                    ? JSON.stringify(input.localControllerDraft)
                    : null
                : existing.localControllerDraft
                    ? JSON.stringify(existing.localControllerDraft)
                    : null, input.localControllerSubmitted !== undefined
                ? input.localControllerSubmitted
                    ? JSON.stringify(input.localControllerSubmitted)
                    : null
                : existing.localControllerSubmitted
                    ? JSON.stringify(existing.localControllerSubmitted)
                    : null, input.manualLotNavigation !== undefined
                ? input.manualLotNavigation
                    ? JSON.stringify(input.manualLotNavigation)
                    : null
                : existing.manualLotNavigation
                    ? JSON.stringify(existing.manualLotNavigation)
                    : null, JSON.stringify(input.lotPhotoOverrides !== undefined
                ? input.lotPhotoOverrides
                : existing.lotPhotoOverrides), input.state.updatedAt ?? now, input.projectId);
        }
        return this.get(input.projectId);
    }
}
exports.BagLiveStateRepository = BagLiveStateRepository;
function parseBagLiveState(value) {
    if (!value || typeof value !== "object")
        return null;
    const state = value;
    if (state.schemaVersion !== bag_live_state_types_1.BAG_LIVE_STATE_SCHEMA_VERSION)
        return null;
    if (typeof state.projectId !== "string" || typeof state.engineId !== "string") {
        return null;
    }
    if (typeof state.updatedAt !== "string")
        return null;
    if (!state.connection || typeof state.connection.status !== "string")
        return null;
    return state;
}
function mapRow(row) {
    let parsed = null;
    try {
        parsed = parseBagLiveState(JSON.parse(row.state_json));
    }
    catch {
        parsed = null;
    }
    if (!parsed) {
        throw new Error(`Stored BAG live state for project ${row.project_id} is invalid.`);
    }
    return {
        projectId: row.project_id,
        engineId: row.engine_id,
        schemaVersion: row.schema_version,
        mode: row.mode === "manual" ? "manual" : "automatic",
        state: parsed,
        automaticState: parseOptionalState(row.automatic_state_json),
        manualState: parseOptionalState(row.manual_state_json),
        manualStartedAt: row.manual_started_at,
        manualStartedBy: row.manual_started_by,
        sourceSnapshotId: row.source_snapshot_id,
        latestScrapedCurrentLot: parseOptionalLot(row.latest_scraped_current_lot_json),
        localControllerDraft: parseOptionalDraft(row.local_controller_draft_json),
        localControllerSubmitted: parseOptionalState(row.local_controller_submitted_json),
        manualLotNavigation: parseOptionalNavigation(row.manual_lot_navigation_json),
        lotPhotoOverrides: (() => {
            if (!row.lot_photo_overrides_json)
                return {};
            try {
                return (0, lot_photo_overrides_1.parseLotPhotoOverrides)(JSON.parse(row.lot_photo_overrides_json));
            }
            catch {
                return {};
            }
        })(),
        updatedAt: row.updated_at,
        createdAt: row.created_at,
    };
}
function parseOptionalLot(value) {
    if (!value)
        return null;
    try {
        return JSON.parse(value);
    }
    catch {
        return null;
    }
}
function parseOptionalDraft(value) {
    if (!value)
        return null;
    try {
        return JSON.parse(value);
    }
    catch {
        return null;
    }
}
function parseOptionalNavigation(value) {
    if (!value)
        return null;
    try {
        return JSON.parse(value);
    }
    catch {
        return null;
    }
}
function parseOptionalState(value) {
    if (!value)
        return null;
    try {
        return parseBagLiveState(JSON.parse(value));
    }
    catch {
        return null;
    }
}
