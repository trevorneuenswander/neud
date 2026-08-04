import { createHash } from "crypto";
import type { LocalDisplay } from "../../repositories/displays-repository";
import type { ProjectDisplayCodeRow } from "../../repositories/project-display-code-repository";
import type { ProjectCodeRevisionRow } from "../../repositories/project-code-revisions-repository";
import type {
  CloudDisplayRevisionRow,
  CloudDisplayRow,
  CloudDisplayTombstoneRow,
} from "./cloud-display-client";
import type { DisplayDeletionTombstone } from "../../repositories/display-deletion-tombstones-repository";

export function hashDisplayHtml(html: string): string {
  return createHash("sha256").update(html).digest("hex");
}

export type CloudDisplayPublicationPhase = "base" | "publish";

export function toCloudDisplayRow(input: {
  display: LocalDisplay;
  code: ProjectDisplayCodeRow | null;
  instanceId: string;
  userId: string | null;
  publicationPhase?: CloudDisplayPublicationPhase;
  publishedRevisionId?: string | null;
  publishedAt?: string | null;
}): CloudDisplayRow {
  const publicationPhase = input.publicationPhase ?? "publish";
  const onlineViewerEnabled =
    Boolean(input.code?.onlineViewerEnabled) && input.display.enabled;
  const targetPublishedRevisionId =
    publicationPhase === "publish" && onlineViewerEnabled
      ? (input.publishedRevisionId ??
        input.code?.onlinePublishedRevisionId ??
        input.code?.publishedRevisionId ??
        null)
      : null;
  const targetPublishedAt =
    publicationPhase === "publish" && onlineViewerEnabled && targetPublishedRevisionId
      ? (input.publishedAt ?? input.code?.onlinePublishedAt ?? new Date().toISOString())
      : null;

  return {
    id: input.display.id,
    project_id: input.display.projectId,
    name: input.display.name,
    description: input.code?.description ?? null,
    slug: input.code?.slug ?? input.display.displayKey,
    display_type: input.code?.sourceType ?? "project-html",
    enabled: input.display.enabled,
    refresh_rate_ms: input.display.refreshRateMs,
    display_width: input.display.displayWidth,
    display_height: input.display.displayHeight,
    is_archived: input.code?.archived ?? false,
    archived_at: input.code?.archivedAt ?? null,
    archived_by_user_id: input.code?.archivedByUserId ?? null,
    active_revision_id: input.code?.publishedRevisionId ?? null,
    created_at: input.display.createdAt,
    created_by_user_id: input.userId,
    updated_at: input.display.updatedAt,
    updated_by_user_id: input.userId,
    deleted_at: null,
    sync_version: input.display.syncVersion,
    source_instance_id: input.instanceId,
    online_viewer_enabled: onlineViewerEnabled,
    online_visibility: input.code?.onlineVisibility ?? "private",
    online_published_at: targetPublishedAt,
    online_published_revision_id: targetPublishedRevisionId,
    online_publish_error:
      publicationPhase === "publish" ? (input.code?.onlinePublishError ?? null) : null,
    sort_order: input.display.sortOrder ?? null,
  };
}

export function toCloudDisplayRevisionRow(input: {
  revision: ProjectCodeRevisionRow;
  displayId: string;
  projectId: string;
  versionNumber: number;
  html: string;
  instanceId: string;
  userId: string | null;
}): CloudDisplayRevisionRow {
  return {
    id: input.revision.id,
    display_id: input.displayId,
    project_id: input.projectId,
    version_number: input.versionNumber,
    html_content: input.html,
    content_hash: hashDisplayHtml(input.html),
    version_note: input.revision.changeNote ?? input.revision.message,
    created_at: input.revision.createdAt,
    created_by_user_id: input.userId,
    restored_from_revision_id:
      typeof input.revision.metadata?.restoredFromRevisionId === "string"
        ? input.revision.metadata.restoredFromRevisionId
        : null,
    sync_version: 1,
    source_instance_id: input.instanceId,
  };
}

export function toCloudDisplayTombstoneRow(
  tombstone: DisplayDeletionTombstone,
): CloudDisplayTombstoneRow {
  return {
    display_id: tombstone.displayId,
    project_id: tombstone.projectId,
    deleted_at: tombstone.deletedAt,
    deleted_by_user_id: tombstone.deletedByUserId,
    source_instance_id: tombstone.sourceInstanceId,
    processed_at: tombstone.syncedAt,
  };
}
