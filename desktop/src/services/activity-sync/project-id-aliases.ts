/**
 * Maps cloud project IDs used in Supabase activity_events.project_id to local
 * SQLite project IDs (and the reverse) via the package directory.
 *
 * Builtin packages such as SEMA may be installed with a random local UUID while
 * cloud activity is keyed by a stable hosted UUID. Activity sync must translate
 * at the boundary without rewriting established local project primary keys.
 */

export type ProjectDirectoryAliasEntry = {
  cloudProjectId: string;
  localProjectId: string | null;
  /** Optional slug used to resolve a missing localProjectId / cloud id. */
  slug?: string | null;
};

/** Local project identity used to fill gaps when directory localProjectId is null. */
export type ActivityLocalProjectRef = {
  id: string;
  slug: string;
};

/**
 * Extra hosted project IDs keyed by slug (e.g. from cloud access directory cache).
 * Used when the package directory still has a builtin: placeholder.
 */
export type ActivityCloudSlugProjectRef = {
  slug: string;
  cloudProjectId: string;
};

export type ActivityPullProjectScope = {
  /** IDs accepted by the cloud pull filter (local + linked cloud UUIDs). */
  accessibleQueryIds: string[];
  /** cloud UUID → local UUID when they differ. */
  cloudToLocal: Map<string, string>;
  /** local UUID → cloud UUID when they differ. */
  localToCloud: Map<string, string>;
  /** Stable fingerprint of active aliases for one-time cursor backfill. */
  aliasFingerprint: string;
};

/** Canonical SEMA cloud seed from migration 057 (may differ if slug already existed). */
export const SEMA_CLOUD_SEED_PROJECT_ID = "5e0a0001-0000-4000-8000-000000000001";

export function isHostedCloudProjectId(id: string): boolean {
  const trimmed = id.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("builtin:") || trimmed.startsWith("local:")) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    trimmed,
  );
}

function registerAlias(
  cloudToLocal: Map<string, string>,
  localToCloud: Map<string, string>,
  queryIds: Set<string>,
  cloudId: string,
  localId: string,
): void {
  if (!isHostedCloudProjectId(cloudId) || !localId) return;
  queryIds.add(cloudId);
  if (cloudId === localId) return;
  // First mapping wins so package-directory entries beat soft seed fallbacks.
  if (!cloudToLocal.has(cloudId)) {
    cloudToLocal.set(cloudId, localId);
  }
  if (!localToCloud.has(localId)) {
    localToCloud.set(localId, cloudId);
  }
}

/**
 * Expand local accessible project IDs with hosted cloud IDs from the package
 * directory so pull does not drop peer-device activity for installed packages.
 *
 * Also accepts optional local project refs (to fill null directory local IDs)
 * and cloud slug refs (when directory still has builtin: placeholders).
 * team_id is intentionally unused — NULL team_id must not exclude rows.
 */
export function buildActivityPullProjectScope(input: {
  accessibleLocalProjectIds: string[];
  directoryEntries: ProjectDirectoryAliasEntry[];
  localProjects?: ActivityLocalProjectRef[];
  cloudProjectsBySlug?: ActivityCloudSlugProjectRef[];
}): ActivityPullProjectScope {
  const localSet = new Set(
    input.accessibleLocalProjectIds.map((id) => id.trim()).filter(Boolean),
  );
  const queryIds = new Set(localSet);
  const cloudToLocal = new Map<string, string>();
  const localToCloud = new Map<string, string>();

  const localIdBySlug = new Map<string, string>();
  for (const project of input.localProjects ?? []) {
    const id = project.id?.trim() || "";
    const slug = project.slug?.trim().toLowerCase() || "";
    if (!id || !slug || !localSet.has(id)) continue;
    localIdBySlug.set(slug, id);
  }

  for (const entry of input.directoryEntries) {
    const cloudId = entry.cloudProjectId?.trim() || "";
    const slug = entry.slug?.trim().toLowerCase() || "";
    let localId = entry.localProjectId?.trim() || "";
    if (!localId && slug) {
      localId = localIdBySlug.get(slug) ?? "";
    }
    if (!localId || !localSet.has(localId)) continue;
    registerAlias(cloudToLocal, localToCloud, queryIds, cloudId, localId);
  }

  for (const cloud of input.cloudProjectsBySlug ?? []) {
    const slug = cloud.slug?.trim().toLowerCase() || "";
    const cloudId = cloud.cloudProjectId?.trim() || "";
    const localId = localIdBySlug.get(slug) ?? "";
    if (!slug || !localId) continue;
    registerAlias(cloudToLocal, localToCloud, queryIds, cloudId, localId);
  }

  // Soft SEMA seed fallback: only when a local SEMA project is accessible and no
  // hosted cloud mapping was discovered yet (directory still builtin: / missing).
  const semaLocalId = localIdBySlug.get("sema");
  if (semaLocalId && !localToCloud.has(semaLocalId)) {
    registerAlias(
      cloudToLocal,
      localToCloud,
      queryIds,
      SEMA_CLOUD_SEED_PROJECT_ID,
      semaLocalId,
    );
  }

  const aliasFingerprint = [...cloudToLocal.entries()]
    .map(([cloud, local]) => `${cloud}->${local}`)
    .sort()
    .join("|");

  return {
    accessibleQueryIds: [...queryIds],
    cloudToLocal,
    localToCloud,
    aliasFingerprint,
  };
}

/** Resolve the hosted UUID to use for cloud upload without mutating local SQLite. */
export function resolveCloudProjectIdForUpload(
  localProjectId: string | null | undefined,
  localToCloud: Map<string, string>,
): string | null {
  const localId = typeof localProjectId === "string" ? localProjectId.trim() : "";
  if (!localId) return null;
  return localToCloud.get(localId) ?? localId;
}

/** Rewrite pulled activity metadata.projectId from cloud UUID to local UUID. */
export function remapCloudActivityProjectId(
  metadata: Record<string, unknown>,
  cloudProjectId: string | null | undefined,
  cloudToLocal: Map<string, string>,
): Record<string, unknown> {
  if (!cloudProjectId) return metadata;
  const localId = cloudToLocal.get(cloudProjectId);
  if (!localId || localId === cloudProjectId) return metadata;
  return {
    ...metadata,
    projectId: localId,
  };
}

/**
 * Tables that realignProjectId currently rewrites. Documented for safety audits —
 * several project-scoped tables are NOT in this list and would break if UUID
 * rewriting were used for established installs.
 */
export const REALIGN_PROJECT_ID_TABLES = [
  "import_history",
  "bag_manual_events",
  "bag_live_state",
  "data_sources",
  "displays",
  "controllers",
  "assets",
  "publishing_targets",
  "project_settings",
  "project_memberships",
  "project_display_code",
  "project_scraper_code",
  "project_code_revisions",
  "project_validation_logs",
  "display_deletion_tombstones",
  "project_team_assignments",
  "local_project_memberships",
  "user_display_order",
  "user_pinned_viewer_preferences",
  "project_package_installs",
] as const;

/** Known project-scoped tables NOT covered by realignProjectId (as of v0.3.1). */
export const REALIGN_PROJECT_ID_GAPS = [
  "sema_schedule_state",
  "output_routes",
  "display_media_assets",
  "project_capabilities",
  "project_photo_uploads",
  "display_sync_state", // if present / related display sync rows keyed by project_id
] as const;
