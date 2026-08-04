import { randomUUID } from "crypto";
import type { LocalDatabase } from "../database/connection";

export type PhotoUploadStatus =
  | "pending"
  | "uploading"
  | "uploaded"
  | "failed"
  | "orphan_candidate";

export type ProjectPhotoUploadRecord = {
  id: string;
  projectId: string;
  lotKey: string | null;
  displayUrl: string;
  localPath: string;
  contentHash: string;
  storageObjectId: string | null;
  originalFilename: string | null;
  status: PhotoUploadStatus;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: string;
  project_id: string;
  lot_key: string | null;
  display_url: string;
  local_path: string;
  content_hash: string;
  storage_object_id: string | null;
  original_filename: string | null;
  status: PhotoUploadStatus;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

function mapRow(row: Row): ProjectPhotoUploadRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    lotKey: row.lot_key,
    displayUrl: row.display_url,
    localPath: row.local_path,
    contentHash: row.content_hash,
    storageObjectId: row.storage_object_id,
    originalFilename: row.original_filename,
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ProjectPhotoUploadRepository {
  constructor(private readonly db: LocalDatabase) {}

  upsertPending(input: {
    projectId: string;
    lotKey?: string | null;
    displayUrl: string;
    localPath: string;
    contentHash: string;
    originalFilename?: string | null;
  }): ProjectPhotoUploadRecord {
    const existing = this.getByContentHash(input.projectId, input.contentHash);
    if (existing) {
      this.db
        .prepare(
          `UPDATE project_photo_uploads
           SET display_url = ?, local_path = ?, lot_key = COALESCE(?, lot_key),
               original_filename = COALESCE(?, original_filename),
               status = CASE WHEN status = 'orphan_candidate' THEN 'pending' ELSE status END,
               updated_at = datetime('now')
           WHERE id = ?`,
        )
        .run(
          input.displayUrl,
          input.localPath,
          input.lotKey ?? null,
          input.originalFilename ?? null,
          existing.id,
        );
      return this.getById(existing.id)!;
    }

    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO project_photo_uploads (
          id, project_id, lot_key, display_url, local_path, content_hash,
          original_filename, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      )
      .run(
        id,
        input.projectId,
        input.lotKey ?? null,
        input.displayUrl,
        input.localPath,
        input.contentHash,
        input.originalFilename ?? null,
      );
    return this.getById(id)!;
  }

  getById(id: string): ProjectPhotoUploadRecord | null {
    const row = this.db
      .prepare("SELECT * FROM project_photo_uploads WHERE id = ?")
      .get(id) as Row | undefined;
    return row ? mapRow(row) : null;
  }

  getByContentHash(projectId: string, contentHash: string): ProjectPhotoUploadRecord | null {
    const row = this.db
      .prepare(
        "SELECT * FROM project_photo_uploads WHERE project_id = ? AND content_hash = ?",
      )
      .get(projectId, contentHash) as Row | undefined;
    return row ? mapRow(row) : null;
  }

  getByDisplayUrl(projectId: string, displayUrl: string): ProjectPhotoUploadRecord | null {
    const row = this.db
      .prepare(
        "SELECT * FROM project_photo_uploads WHERE project_id = ? AND display_url = ? ORDER BY updated_at DESC LIMIT 1",
      )
      .get(projectId, displayUrl) as Row | undefined;
    return row ? mapRow(row) : null;
  }

  listRetryable(limit = 50): ProjectPhotoUploadRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM project_photo_uploads
         WHERE status IN ('pending', 'failed')
         ORDER BY updated_at ASC
         LIMIT ?`,
      )
      .all(limit) as Row[];
    return rows.map(mapRow);
  }

  listForProject(projectId: string): ProjectPhotoUploadRecord[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM project_photo_uploads WHERE project_id = ? ORDER BY updated_at DESC",
      )
      .all(projectId) as Row[];
    return rows.map(mapRow);
  }

  markUploading(id: string): void {
    this.db
      .prepare(
        `UPDATE project_photo_uploads
         SET status = 'uploading', error_message = NULL, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(id);
  }

  markUploaded(id: string, storageObjectId: string): void {
    this.db
      .prepare(
        `UPDATE project_photo_uploads
         SET status = 'uploaded', storage_object_id = ?, error_message = NULL,
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(storageObjectId, id);
  }

  markFailed(id: string, errorMessage: string): void {
    this.db
      .prepare(
        `UPDATE project_photo_uploads
         SET status = 'failed', error_message = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(errorMessage.slice(0, 500), id);
  }

  markOrphanCandidateByDisplayUrl(projectId: string, displayUrl: string): void {
    this.db
      .prepare(
        `UPDATE project_photo_uploads
         SET status = 'orphan_candidate', updated_at = datetime('now')
         WHERE project_id = ? AND display_url = ?`,
      )
      .run(projectId, displayUrl);
  }
}
