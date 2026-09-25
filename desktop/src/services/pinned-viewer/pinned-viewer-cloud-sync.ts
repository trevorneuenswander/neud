import type { SupabaseClient } from "@supabase/supabase-js";
import {
  clampPinnedViewerHeight,
  normalizePinnedViewerHeight,
  parsePinnedDisplayIds,
} from "../../lib/displays/pinned-viewer-preference";
import {
  parsePinnedStacks,
  type PinnedStackRecord,
} from "../../lib/displays/pinned-viewer-stacks";
import type { UserPinnedViewerPreferenceRow } from "../../repositories/user-pinned-viewer-repository";

type CloudPinnedViewerRow = {
  user_id: string;
  project_id: string;
  pinned_display_ids: string[] | null;
  pinned_stacks?: unknown;
  viewer_height_px: number;
  updated_at: string;
};

export async function fetchCloudPinnedViewerPreference(
  client: SupabaseClient,
  projectId: string,
): Promise<{
  pinnedDisplayIds: string[];
  pinnedStacks: PinnedStackRecord[];
  viewerHeightPx: number;
  updatedAt: string;
} | null> {
  const { data, error } = await client
    .from("user_pinned_viewer_preferences")
    .select("pinned_display_ids, pinned_stacks, viewer_height_px, updated_at")
    .eq("project_id", projectId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    return null;
  }

  const row = data as CloudPinnedViewerRow;
  return {
    pinnedDisplayIds: parsePinnedDisplayIds(row.pinned_display_ids),
    pinnedStacks: parsePinnedStacks(row.pinned_stacks),
    viewerHeightPx: normalizePinnedViewerHeight(row.viewer_height_px),
    updatedAt: row.updated_at,
  };
}

export async function upsertCloudPinnedViewerPreference(
  client: SupabaseClient,
  input: {
    userId: string;
    projectId: string;
    pinnedDisplayIds: string[];
    pinnedStacks: PinnedStackRecord[];
    viewerHeightPx: number;
    updatedAt: string;
  },
): Promise<{ updatedAt: string }> {
  const payload = {
    user_id: input.userId,
    project_id: input.projectId,
    pinned_display_ids: parsePinnedDisplayIds(input.pinnedDisplayIds),
    pinned_stacks: parsePinnedStacks(input.pinnedStacks),
    viewer_height_px: normalizePinnedViewerHeight(input.viewerHeightPx),
    updated_at: input.updatedAt,
  };

  const { data, error } = await client
    .from("user_pinned_viewer_preferences")
    .upsert(payload, { onConflict: "user_id,project_id" })
    .select("updated_at")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return { updatedAt: String((data as { updated_at: string }).updated_at) };
}

export function cloudRowToLocalPreference(
  userId: string,
  projectId: string,
  remote: {
    pinnedDisplayIds: string[];
    pinnedStacks: PinnedStackRecord[];
    viewerHeightPx: number;
    updatedAt: string;
  },
): UserPinnedViewerPreferenceRow {
  return {
    userId,
    projectId,
    pinnedDisplayIds: remote.pinnedDisplayIds,
    pinnedStacks: remote.pinnedStacks,
    viewerHeightPx: remote.viewerHeightPx,
    updatedAt: remote.updatedAt,
    cloudSyncStatus: "synced",
    cloudUpdatedAt: remote.updatedAt,
  };
}
