import type { LocalDatabase } from "../../database/connection";
import type { LocalControllerDraft } from "./bag-local-controller-state";
import type { ManualLotNavigationState } from "./bag-manual-lot-navigation";
import {
  parseLotPhotoOverrides,
  type LotPhotoOverrides,
} from "./lot-photo-overrides";
import {
  BAG_LIVE_STATE_SCHEMA_VERSION,
  type BagLiveLot,
  type BagLiveState,
  type BagLiveStateMode,
} from "./bag-live-state-types";

export type BagLiveStateRecord = {
  projectId: string;
  engineId: string;
  schemaVersion: number;
  mode: BagLiveStateMode;
  state: BagLiveState;
  automaticState: BagLiveState | null;
  manualState: BagLiveState | null;
  manualStartedAt: string | null;
  manualStartedBy: string | null;
  sourceSnapshotId: string | null;
  latestScrapedCurrentLot: BagLiveLot | null;
  localControllerDraft: LocalControllerDraft | null;
  localControllerSubmitted: BagLiveState | null;
  manualLotNavigation: ManualLotNavigationState | null;
  lotPhotoOverrides: LotPhotoOverrides;
  updatedAt: string;
  createdAt: string;
};

type BagLiveStateRow = {
  project_id: string;
  engine_id: string;
  schema_version: number;
  mode: string;
  state_json: string;
  automatic_state_json: string | null;
  manual_state_json: string | null;
  manual_started_at: string | null;
  manual_started_by: string | null;
  source_snapshot_id: string | null;
  latest_scraped_current_lot_json: string | null;
  local_controller_draft_json: string | null;
  local_controller_submitted_json: string | null;
  manual_lot_navigation_json: string | null;
  lot_photo_overrides_json?: string | null;
  updated_at: string;
  created_at: string;
};

export class BagLiveStateRepository {
  constructor(private readonly db: LocalDatabase) {}

  get(projectId: string): BagLiveStateRecord | null {
    const row = this.db
      .prepare("SELECT * FROM bag_live_state WHERE project_id = ?")
      .get(projectId) as BagLiveStateRow | undefined;
    return row ? mapRow(row) : null;
  }

  upsert(input: {
    projectId: string;
    engineId: string;
    state: BagLiveState;
    automaticState?: BagLiveState | null;
    manualState?: BagLiveState | null;
    manualStartedAt?: string | null;
    manualStartedBy?: string | null;
    sourceSnapshotId?: string | null;
    latestScrapedCurrentLot?: BagLiveLot | null;
    localControllerDraft?: LocalControllerDraft | null;
    localControllerSubmitted?: BagLiveState | null;
    manualLotNavigation?: ManualLotNavigationState | null;
    lotPhotoOverrides?: LotPhotoOverrides;
  }): BagLiveStateRecord {
    const now = new Date().toISOString();
    const existing = this.get(input.projectId);

    if (!existing) {
      this.db
        .prepare(
          `INSERT INTO bag_live_state (
            project_id, engine_id, schema_version, mode, state_json,
            automatic_state_json, manual_state_json, manual_started_at,
            manual_started_by, source_snapshot_id,
            latest_scraped_current_lot_json, local_controller_draft_json,
            local_controller_submitted_json, manual_lot_navigation_json,
            lot_photo_overrides_json, updated_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.projectId,
          input.engineId,
          input.state.schemaVersion,
          input.state.mode,
          JSON.stringify(input.state),
          input.automaticState ? JSON.stringify(input.automaticState) : null,
          input.manualState ? JSON.stringify(input.manualState) : null,
          input.manualStartedAt ?? null,
          input.manualStartedBy ?? null,
          input.sourceSnapshotId ?? null,
          input.latestScrapedCurrentLot
            ? JSON.stringify(input.latestScrapedCurrentLot)
            : null,
          input.localControllerDraft
            ? JSON.stringify(input.localControllerDraft)
            : null,
          input.localControllerSubmitted
            ? JSON.stringify(input.localControllerSubmitted)
            : null,
          input.manualLotNavigation
            ? JSON.stringify(input.manualLotNavigation)
            : null,
          JSON.stringify(input.lotPhotoOverrides ?? {}),
          input.state.updatedAt ?? now,
          now,
        );
    } else {
      this.db
        .prepare(
          `UPDATE bag_live_state SET
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
          WHERE project_id = ?`,
        )
        .run(
          input.engineId,
          input.state.schemaVersion,
          input.state.mode,
          JSON.stringify(input.state),
          input.automaticState !== undefined
            ? input.automaticState
              ? JSON.stringify(input.automaticState)
              : null
            : existing.automaticState
              ? JSON.stringify(existing.automaticState)
              : null,
          input.manualState !== undefined
            ? input.manualState
              ? JSON.stringify(input.manualState)
              : null
            : existing.manualState
              ? JSON.stringify(existing.manualState)
              : null,
          input.manualStartedAt !== undefined
            ? input.manualStartedAt
            : existing.manualStartedAt,
          input.manualStartedBy !== undefined
            ? input.manualStartedBy
            : existing.manualStartedBy,
          input.sourceSnapshotId ?? existing.sourceSnapshotId,
          input.latestScrapedCurrentLot !== undefined
            ? input.latestScrapedCurrentLot
              ? JSON.stringify(input.latestScrapedCurrentLot)
              : null
            : existing.latestScrapedCurrentLot
              ? JSON.stringify(existing.latestScrapedCurrentLot)
              : null,
          input.localControllerDraft !== undefined
            ? input.localControllerDraft
              ? JSON.stringify(input.localControllerDraft)
              : null
            : existing.localControllerDraft
              ? JSON.stringify(existing.localControllerDraft)
              : null,
          input.localControllerSubmitted !== undefined
            ? input.localControllerSubmitted
              ? JSON.stringify(input.localControllerSubmitted)
              : null
            : existing.localControllerSubmitted
              ? JSON.stringify(existing.localControllerSubmitted)
              : null,
          input.manualLotNavigation !== undefined
            ? input.manualLotNavigation
              ? JSON.stringify(input.manualLotNavigation)
              : null
            : existing.manualLotNavigation
              ? JSON.stringify(existing.manualLotNavigation)
              : null,
          JSON.stringify(
            input.lotPhotoOverrides !== undefined
              ? input.lotPhotoOverrides
              : existing.lotPhotoOverrides,
          ),
          input.state.updatedAt ?? now,
          input.projectId,
        );
    }

    return this.get(input.projectId)!;
  }
}

export function parseBagLiveState(value: unknown): BagLiveState | null {
  if (!value || typeof value !== "object") return null;
  const state = value as BagLiveState;
  if (state.schemaVersion !== BAG_LIVE_STATE_SCHEMA_VERSION) return null;
  if (typeof state.projectId !== "string" || typeof state.engineId !== "string") {
    return null;
  }
  if (typeof state.updatedAt !== "string") return null;
  if (!state.connection || typeof state.connection.status !== "string") return null;
  return state;
}

function mapRow(row: BagLiveStateRow): BagLiveStateRecord {
  let parsed: BagLiveState | null = null;
  try {
    parsed = parseBagLiveState(JSON.parse(row.state_json));
  } catch {
    parsed = null;
  }

  if (!parsed) {
    throw new Error(
      `Stored BAG live state for project ${row.project_id} is invalid.`,
    );
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
      if (!row.lot_photo_overrides_json) return {};
      try {
        return parseLotPhotoOverrides(JSON.parse(row.lot_photo_overrides_json));
      } catch {
        return {};
      }
    })(),
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

function parseOptionalLot(value: string | null): BagLiveLot | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as BagLiveLot;
  } catch {
    return null;
  }
}

function parseOptionalDraft(value: string | null): LocalControllerDraft | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as LocalControllerDraft;
  } catch {
    return null;
  }
}

function parseOptionalNavigation(value: string | null): ManualLotNavigationState | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as ManualLotNavigationState;
  } catch {
    return null;
  }
}

function parseOptionalState(value: string | null): BagLiveState | null {
  if (!value) return null;
  try {
    return parseBagLiveState(JSON.parse(value));
  } catch {
    return null;
  }
}
