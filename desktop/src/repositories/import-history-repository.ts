import { randomUUID } from "crypto";
import type { LocalDatabase } from "../database/connection";

export type ImportHistoryRecord = {
  id: string;
  sourceType: string;
  sourceProjectId: string | null;
  localProjectId: string;
  importedAt: string;
  importVersion: number;
  sourceUpdatedAt: string | null;
  result: "success" | "failed";
  importedAsCopy: boolean;
  details: Record<string, unknown>;
};

type ImportHistoryRow = {
  id: string;
  source_type: string;
  source_project_id: string | null;
  local_project_id: string;
  imported_at: string;
  import_version: number;
  source_updated_at: string | null;
  result: string;
  imported_as_copy: number;
  details_json: string;
};

export class ImportHistoryRepository {
  constructor(private readonly db: LocalDatabase) {}

  getLatestSuccessForSource(sourceProjectId: string): ImportHistoryRecord | null {
    const row = this.db
      .prepare(
        `SELECT * FROM import_history
         WHERE source_project_id = ? AND result = 'success'
         ORDER BY imported_at DESC
         LIMIT 1`,
      )
      .get(sourceProjectId) as ImportHistoryRow | undefined;

    return row ? mapRow(row) : null;
  }

  listSuccessfulBySourceIds(sourceProjectIds: string[]): ImportHistoryRecord[] {
    if (sourceProjectIds.length === 0) return [];

    const placeholders = sourceProjectIds.map(() => "?").join(", ");
    const rows = this.db
      .prepare(
        `SELECT * FROM import_history
         WHERE source_project_id IN (${placeholders}) AND result = 'success'
         ORDER BY imported_at DESC`,
      )
      .all(...sourceProjectIds) as ImportHistoryRow[];

    const latestBySource = new Map<string, ImportHistoryRecord>();
    for (const row of rows) {
      if (!row.source_project_id) continue;
      if (!latestBySource.has(row.source_project_id)) {
        latestBySource.set(row.source_project_id, mapRow(row));
      }
    }

    return [...latestBySource.values()];
  }

  insert(record: Omit<ImportHistoryRecord, "id" | "importedAt"> & {
    id?: string;
    importedAt?: string;
  }): ImportHistoryRecord {
    const next: ImportHistoryRecord = {
      id: record.id ?? randomUUID(),
      sourceType: record.sourceType,
      sourceProjectId: record.sourceProjectId,
      localProjectId: record.localProjectId,
      importedAt: record.importedAt ?? new Date().toISOString(),
      importVersion: record.importVersion,
      sourceUpdatedAt: record.sourceUpdatedAt,
      result: record.result,
      importedAsCopy: record.importedAsCopy,
      details: record.details,
    };

    this.db
      .prepare(
        `INSERT INTO import_history (
          id, source_type, source_project_id, local_project_id, imported_at,
          import_version, source_updated_at, result, imported_as_copy, details_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        next.id,
        next.sourceType,
        next.sourceProjectId,
        next.localProjectId,
        next.importedAt,
        next.importVersion,
        next.sourceUpdatedAt,
        next.result,
        next.importedAsCopy ? 1 : 0,
        JSON.stringify(next.details),
      );

    return next;
  }
}

function mapRow(row: ImportHistoryRow): ImportHistoryRecord {
  return {
    id: row.id,
    sourceType: row.source_type,
    sourceProjectId: row.source_project_id,
    localProjectId: row.local_project_id,
    importedAt: row.imported_at,
    importVersion: row.import_version,
    sourceUpdatedAt: row.source_updated_at,
    result: row.result === "success" ? "success" : "failed",
    importedAsCopy: row.imported_as_copy === 1,
    details: parseJsonObject(row.details_json),
  };
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
