"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashDisplayHtml = hashDisplayHtml;
exports.toCloudDisplayRow = toCloudDisplayRow;
exports.toCloudDisplayRevisionRow = toCloudDisplayRevisionRow;
exports.toCloudDisplayTombstoneRow = toCloudDisplayTombstoneRow;
const crypto_1 = require("crypto");
function hashDisplayHtml(html) {
    return (0, crypto_1.createHash)("sha256").update(html).digest("hex");
}
function toCloudDisplayRow(input) {
    const now = new Date().toISOString();
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
    };
}
function toCloudDisplayRevisionRow(input) {
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
        restored_from_revision_id: typeof input.revision.metadata?.restoredFromRevisionId === "string"
            ? input.revision.metadata.restoredFromRevisionId
            : null,
        sync_version: 1,
        source_instance_id: input.instanceId,
    };
}
function toCloudDisplayTombstoneRow(tombstone) {
    return {
        display_id: tombstone.displayId,
        project_id: tombstone.projectId,
        deleted_at: tombstone.deletedAt,
        deleted_by_user_id: tombstone.deletedByUserId,
        source_instance_id: tombstone.sourceInstanceId,
        processed_at: tombstone.syncedAt,
    };
}
