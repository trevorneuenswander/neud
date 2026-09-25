import type { LocalDatabase } from "../database/connection";
import {
  DEFAULT_PINNED_VIEWER_HEIGHT_PX,
  parsePinnedDisplayIds,
} from "../lib/displays/pinned-viewer-preference";
import {
  parsePinnedStacks,
  type PinnedStackRecord,
} from "../lib/displays/pinned-viewer-stacks";

export type UserPinnedViewerPreferenceRow = {
  userId: string;
  projectId: string;
  pinnedDisplayIds: string[];
  pinnedStacks: PinnedStackRecord[];
  viewerHeightPx: number;
  updatedAt: string;
  cloudSyncStatus: "pending" | "synced" | "failed";
  cloudUpdatedAt: string | null;
};

type DbRow = {
  user_id: string;
  project_id: string;
  pinned_display_ids: string;
  pinned_stacks?: string;
  viewer_height_px: number;
  updated_at: string;
  cloud_sync_status: string;
  cloud_updated_at: string | null;
};

function mapRow(row: DbRow): UserPinnedViewerPreferenceRow {
  let pinnedDisplayIds: string[] = [];
  try {
    pinnedDisplayIds = parsePinnedDisplayIds(JSON.parse(row.pinned_display_ids));
  } catch {
    pinnedDisplayIds = [];
  }
  const syncStatus = row.cloud_sync_status;
  let pinnedStacks: PinnedStackRecord[] = [];
  try {
    pinnedStacks = parsePinnedStacks(JSON.parse(row.pinned_stacks ?? "[]"));
  } catch {
    pinnedStacks = [];
  }
  return {
    userId: row.user_id,
    projectId: row.project_id,
    pinnedDisplayIds,
    pinnedStacks,
    viewerHeightPx: row.viewer_height_px,
    updatedAt: row.updated_at,
    cloudSyncStatus:
      syncStatus === "synced" || syncStatus === "failed" ? syncStatus : "pending",
    cloudUpdatedAt: row.cloud_updated_at,
  };
}

export class UserPinnedViewerRepository {
  constructor(private readonly db: LocalDatabase) {}

  get(userId: string, projectId: string): UserPinnedViewerPreferenceRow | null {
    const row = this.db
      .prepare(
        `SELECT * FROM user_pinned_viewer_preferences
         WHERE user_id = ? AND project_id = ?`,
      )
      .get(userId, projectId) as DbRow | undefined;
    return row ? mapRow(row) : null;
  }

  listPendingSync(limit = 50): UserPinnedViewerPreferenceRow[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM user_pinned_viewer_preferences
         WHERE cloud_sync_status = 'pending' OR cloud_sync_status = 'failed'
         ORDER BY updated_at ASC
         LIMIT ?`,
      )
      .all(limit) as DbRow[];
    return rows.map(mapRow);
  }

  upsert(input: {
    userId: string;
    projectId: string;
    pinnedDisplayIds: string[];
    pinnedStacks?: PinnedStackRecord[];
    viewerHeightPx: number;
    updatedAt: string;
    cloudSyncStatus?: "pending" | "synced" | "failed";
    cloudUpdatedAt?: string | null;
  }): UserPinnedViewerPreferenceRow {
    const cloudSyncStatus = input.cloudSyncStatus ?? "pending";
    this.db
      .prepare(
        `INSERT INTO user_pinned_viewer_preferences (
           user_id, project_id, pinned_display_ids, pinned_stacks, viewer_height_px,
           updated_at, cloud_sync_status, cloud_updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, project_id) DO UPDATE SET
           pinned_display_ids = excluded.pinned_display_ids,
           pinned_stacks = excluded.pinned_stacks,
           viewer_height_px = excluded.viewer_height_px,
           updated_at = excluded.updated_at,
           cloud_sync_status = excluded.cloud_sync_status,
           cloud_updated_at = excluded.cloud_updated_at`,
      )
      .run(
        input.userId,
        input.projectId,
        JSON.stringify(parsePinnedDisplayIds(input.pinnedDisplayIds)),
        JSON.stringify(parsePinnedStacks(input.pinnedStacks ?? [])),
        input.viewerHeightPx || DEFAULT_PINNED_VIEWER_HEIGHT_PX,
        input.updatedAt,
        cloudSyncStatus,
        input.cloudUpdatedAt ?? null,
      );
    return this.get(input.userId, input.projectId)!;
  }

  markSynced(userId: string, projectId: string, cloudUpdatedAt: string) {
    this.db
      .prepare(
        `UPDATE user_pinned_viewer_preferences
         SET cloud_sync_status = 'synced', cloud_updated_at = ?
         WHERE user_id = ? AND project_id = ?`,
      )
      .run(cloudUpdatedAt, userId, projectId);
  }

  markSyncFailed(userId: string, projectId: string) {
    this.db
      .prepare(
        `UPDATE user_pinned_viewer_preferences
         SET cloud_sync_status = 'failed'
         WHERE user_id = ? AND project_id = ?`,
      )
      .run(userId, projectId);
  }

  removeForProject(projectId: string) {
    this.db
      .prepare("DELETE FROM user_pinned_viewer_preferences WHERE project_id = ?")
      .run(projectId);
  }
}
