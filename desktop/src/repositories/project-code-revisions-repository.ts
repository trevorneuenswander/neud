import { randomUUID } from "crypto";
import type { LocalDatabase } from "../database/connection";

export type ProjectCodeRevisionRow = {
  id: string;
  projectId: string;
  resourceType: "scraper" | "display";
  resourceId: string;
  revisionName: string | null;
  changeNote: string | null;
  message: string | null;
  sourceHash: string;
  validationStatus: "valid" | "invalid" | "not-validated";
  versionNumber: number | null;
  createdAt: string;
  createdBy: string;
  metadata: Record<string, unknown>;
};

export class ProjectCodeRevisionsRepository {
  constructor(private readonly db: LocalDatabase) {}

  getNextDisplayVersionNumber(projectId: string, displayId: string): number {
    const row = this.db
      .prepare(
        `SELECT COALESCE(MAX(version_number), 0) AS max_version
         FROM project_code_revisions
         WHERE project_id = ? AND resource_type = 'display' AND resource_id = ?`,
      )
      .get(projectId, displayId) as { max_version: number } | undefined;
    return Number(row?.max_version ?? 0) + 1;
  }

  create(input: {
    id?: string;
    projectId: string;
    resourceType: "scraper" | "display";
    resourceId: string;
    revisionName?: string | null;
    changeNote?: string | null;
    message?: string | null;
    sourceHash: string;
    validationStatus?: "valid" | "invalid" | "not-validated";
    createdBy: string;
    metadata?: Record<string, unknown>;
    versionNumber?: number | null;
  }): ProjectCodeRevisionRow {
    const id = input.id ?? randomUUID();
    const now = new Date().toISOString();
    const versionNumber =
      input.resourceType === "display"
        ? (input.versionNumber ??
          this.getNextDisplayVersionNumber(input.projectId, input.resourceId))
        : (input.versionNumber ?? null);
    const record: ProjectCodeRevisionRow = {
      id,
      projectId: input.projectId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      revisionName: input.revisionName ?? null,
      changeNote: input.changeNote ?? null,
      message: input.message ?? null,
      sourceHash: input.sourceHash,
      validationStatus: input.validationStatus ?? "not-validated",
      versionNumber,
      createdAt: now,
      createdBy: input.createdBy,
      metadata: input.metadata ?? {},
    };

    this.db
      .prepare(
        `INSERT INTO project_code_revisions (
          id, project_id, resource_type, resource_id, revision_name, change_note,
          message, source_hash, validation_status, version_number, created_at, created_by, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.projectId,
        record.resourceType,
        record.resourceId,
        record.revisionName,
        record.changeNote,
        record.message,
        record.sourceHash,
        record.validationStatus,
        record.versionNumber,
        record.createdAt,
        record.createdBy,
        JSON.stringify(record.metadata),
      );

    return record;
  }

  insertFromCloudIfMissing(input: {
    id: string;
    projectId: string;
    resourceType: "scraper" | "display";
    resourceId: string;
    revisionName?: string | null;
    changeNote?: string | null;
    message?: string | null;
    sourceHash: string;
    validationStatus?: "valid" | "invalid" | "not-validated";
    createdBy: string;
    metadata?: Record<string, unknown>;
    versionNumber: number;
    createdAt?: string;
  }): ProjectCodeRevisionRow | null {
    if (this.getById(input.id)) {
      return this.getById(input.id);
    }

    const duplicateHash = this.db
      .prepare(
        `SELECT id FROM project_code_revisions
         WHERE project_id = ? AND resource_type = ? AND resource_id = ? AND source_hash = ?
         LIMIT 1`,
      )
      .get(input.projectId, input.resourceType, input.resourceId, input.sourceHash) as
      | { id: string }
      | undefined;
    if (duplicateHash) {
      return this.getById(duplicateHash.id);
    }

    const now = input.createdAt ?? new Date().toISOString();
    const record: ProjectCodeRevisionRow = {
      id: input.id,
      projectId: input.projectId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      revisionName: input.revisionName ?? null,
      changeNote: input.changeNote ?? null,
      message: input.message ?? null,
      sourceHash: input.sourceHash,
      validationStatus: input.validationStatus ?? "valid",
      versionNumber: input.versionNumber,
      createdAt: now,
      createdBy: input.createdBy,
      metadata: input.metadata ?? {},
    };

    this.db
      .prepare(
        `INSERT INTO project_code_revisions (
          id, project_id, resource_type, resource_id, revision_name, change_note,
          message, source_hash, validation_status, version_number, created_at, created_by, metadata_json,
          sync_status, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?)`,
      )
      .run(
        record.id,
        record.projectId,
        record.resourceType,
        record.resourceId,
        record.revisionName,
        record.changeNote,
        record.message,
        record.sourceHash,
        record.validationStatus,
        record.versionNumber,
        record.createdAt,
        record.createdBy,
        JSON.stringify(record.metadata),
        now,
      );

    return record;
  }

  getById(revisionId: string): ProjectCodeRevisionRow | null {
    const row = this.db
      .prepare("SELECT * FROM project_code_revisions WHERE id = ?")
      .get(revisionId) as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  }

  findByResourceAndSourceHash(input: {
    projectId: string;
    resourceType: "scraper" | "display";
    resourceId: string;
    sourceHash: string;
  }): ProjectCodeRevisionRow | null {
    const row = this.db
      .prepare(
        `SELECT * FROM project_code_revisions
         WHERE project_id = ? AND resource_type = ? AND resource_id = ? AND source_hash = ?
         LIMIT 1`,
      )
      .get(input.projectId, input.resourceType, input.resourceId, input.sourceHash) as
      | Record<string, unknown>
      | undefined;
    return row ? mapRow(row) : null;
  }

  findByResourceAndVersionNumber(input: {
    projectId: string;
    resourceType: "scraper" | "display";
    resourceId: string;
    versionNumber: number;
  }): ProjectCodeRevisionRow | null {
    const row = this.db
      .prepare(
        `SELECT * FROM project_code_revisions
         WHERE project_id = ? AND resource_type = ? AND resource_id = ? AND version_number = ?
         LIMIT 1`,
      )
      .get(
        input.projectId,
        input.resourceType,
        input.resourceId,
        input.versionNumber,
      ) as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  }

  countForResource(input: {
    projectId: string;
    resourceType: "scraper" | "display";
    resourceId: string;
  }): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM project_code_revisions
         WHERE project_id = ? AND resource_type = ? AND resource_id = ?`,
      )
      .get(input.projectId, input.resourceType, input.resourceId) as { count: number };
    return Number(row?.count ?? 0);
  }

  reassignVersionNumber(revisionId: string, versionNumber: number): boolean {
    if (!this.getById(revisionId)) {
      return false;
    }
    this.db
      .prepare("UPDATE project_code_revisions SET version_number = ? WHERE id = ?")
      .run(versionNumber, revisionId);
    return true;
  }

  reconcileRevisionIdentity(input: {
    fromRevisionId: string;
    toRevisionId: string;
    displayId: string;
    versionNumber: number;
    onStorageRelocate?: (fromRevisionId: string, toRevisionId: string) => void;
  }): boolean {
    if (input.fromRevisionId === input.toRevisionId) {
      return true;
    }
    if (this.getById(input.toRevisionId)) {
      return true;
    }
    if (!this.getById(input.fromRevisionId)) {
      return false;
    }

    this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE project_code_revisions
           SET id = ?, version_number = ?
           WHERE id = ?`,
        )
        .run(input.toRevisionId, input.versionNumber, input.fromRevisionId);

      this.db
        .prepare(
          `UPDATE project_display_code
           SET published_revision_id = ?
           WHERE display_id = ? AND published_revision_id = ?`,
        )
        .run(input.toRevisionId, input.displayId, input.fromRevisionId);

      this.db
        .prepare(
          `UPDATE display_sync_queue
           SET entity_id = ?
           WHERE entity_type = 'display_revision' AND entity_id = ?`,
        )
        .run(input.toRevisionId, input.fromRevisionId);
    });

    input.onStorageRelocate?.(input.fromRevisionId, input.toRevisionId);
    return true;
  }

  insertCloudRevision(input: {
    id: string;
    projectId: string;
    resourceType: "scraper" | "display";
    resourceId: string;
    revisionName?: string | null;
    changeNote?: string | null;
    message?: string | null;
    sourceHash: string;
    validationStatus?: "valid" | "invalid" | "not-validated";
    createdBy: string;
    metadata?: Record<string, unknown>;
    versionNumber: number;
    createdAt?: string;
  }): ProjectCodeRevisionRow {
    const now = input.createdAt ?? new Date().toISOString();
    const record: ProjectCodeRevisionRow = {
      id: input.id,
      projectId: input.projectId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      revisionName: input.revisionName ?? null,
      changeNote: input.changeNote ?? null,
      message: input.message ?? null,
      sourceHash: input.sourceHash,
      validationStatus: input.validationStatus ?? "valid",
      versionNumber: input.versionNumber,
      createdAt: now,
      createdBy: input.createdBy,
      metadata: { ...(input.metadata ?? {}), cloudSynced: true },
    };

    this.db
      .prepare(
        `INSERT INTO project_code_revisions (
          id, project_id, resource_type, resource_id, revision_name, change_note,
          message, source_hash, validation_status, version_number, created_at, created_by, metadata_json,
          sync_status, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?)`,
      )
      .run(
        record.id,
        record.projectId,
        record.resourceType,
        record.resourceId,
        record.revisionName,
        record.changeNote,
        record.message,
        record.sourceHash,
        record.validationStatus,
        record.versionNumber,
        record.createdAt,
        record.createdBy,
        JSON.stringify(record.metadata),
        now,
      );

    return record;
  }

  listForResource(input: {
    projectId: string;
    resourceType: "scraper" | "display";
    resourceId: string;
    limit?: number;
  }): ProjectCodeRevisionRow[] {
    const limit = input.limit ?? 50;
    const rows = this.db
      .prepare(
        `SELECT * FROM project_code_revisions
         WHERE project_id = ? AND resource_type = ? AND resource_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(input.projectId, input.resourceType, input.resourceId, limit) as Record<
        string,
        unknown
      >[];
    return rows.map(mapRow);
  }

  deleteById(revisionId: string): boolean {
    const existing = this.getById(revisionId);
    if (!existing) {
      return false;
    }

    this.db.prepare("DELETE FROM project_code_revisions WHERE id = ?").run(revisionId);
    return true;
  }

  deleteByResource(input: {
    projectId: string;
    resourceType: "scraper" | "display";
    resourceId: string;
  }): void {
    this.db
      .prepare(
        `DELETE FROM project_code_revisions
         WHERE project_id = ? AND resource_type = ? AND resource_id = ?`,
      )
      .run(input.projectId, input.resourceType, input.resourceId);
  }

  updateRevisionName(revisionId: string, revisionName: string): ProjectCodeRevisionRow | null {
    const existing = this.getById(revisionId);
    if (!existing) {
      return null;
    }

    this.db
      .prepare(
        `UPDATE project_code_revisions
         SET revision_name = ?
         WHERE id = ?`,
      )
      .run(revisionName, revisionId);

    return {
      ...existing,
      revisionName,
    };
  }
}

export class ProjectValidationLogsRepository {
  constructor(private readonly db: LocalDatabase) {}

  append(input: {
    projectId: string;
    resourceType: "scraper" | "display";
    resourceId: string;
    status: "valid" | "invalid";
    summary: string;
    details: unknown[];
    createdBy?: string | null;
  }) {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO project_validation_logs (
          project_id, resource_type, resource_id, status, summary,
          details_json, created_at, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.projectId,
        input.resourceType,
        input.resourceId,
        input.status,
        input.summary,
        JSON.stringify(input.details),
        now,
        input.createdBy ?? null,
      );
  }

  listByProject(projectId: string, limit = 100) {
    const rows = this.db
      .prepare(
        `SELECT * FROM project_validation_logs
         WHERE project_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(projectId, limit) as Record<string, unknown>[];
    return rows.map((row) => ({
      id: Number(row.id),
      projectId: String(row.project_id),
      resourceType: String(row.resource_type) as "scraper" | "display",
      resourceId: String(row.resource_id),
      status: String(row.status) as "valid" | "invalid",
      summary: String(row.summary),
      details: JSON.parse(String(row.details_json ?? "[]")) as unknown[],
      createdAt: String(row.created_at),
      createdBy: typeof row.created_by === "string" ? row.created_by : null,
    }));
  }
}

function mapRow(row: Record<string, unknown>): ProjectCodeRevisionRow {
  let metadata: Record<string, unknown> = {};
  try {
    metadata = JSON.parse(String(row.metadata_json ?? "{}")) as Record<string, unknown>;
  } catch {
    metadata = {};
  }

  return {
    id: String(row.id),
    projectId: String(row.project_id),
    resourceType: row.resource_type === "display" ? "display" : "scraper",
    resourceId: String(row.resource_id),
    revisionName:
      typeof row.revision_name === "string" ? row.revision_name : null,
    changeNote: typeof row.change_note === "string" ? row.change_note : null,
    message: typeof row.message === "string" ? row.message : null,
    sourceHash: String(row.source_hash),
    validationStatus:
      row.validation_status === "valid" || row.validation_status === "invalid"
        ? row.validation_status
        : "not-validated",
    versionNumber:
      typeof row.version_number === "number"
        ? row.version_number
        : row.version_number == null
          ? null
          : Number(row.version_number) || null,
    createdAt: String(row.created_at),
    createdBy: String(row.created_by),
    metadata,
  };
}
