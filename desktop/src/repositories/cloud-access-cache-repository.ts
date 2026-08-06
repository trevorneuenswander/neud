import type { LocalDatabase } from "../database/connection";

const CACHE_ROW_ID = 1;
const SCHEMA_VERSION = 1;
export const CLOUD_ACCESS_CACHE_MIGRATION = "035_cloud_access_cache.sql";

export type CloudAccessCacheReadResult = {
  directory: Record<string, unknown>;
  syncedAt: string;
};

export class CloudAccessCacheRepository {
  constructor(private readonly db: LocalDatabase) {}

  isTableAvailable(): boolean {
    try {
      const row = this.db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'cloud_access_cache' LIMIT 1`,
        )
        .get() as { name?: string } | undefined;
      return row?.name === "cloud_access_cache";
    } catch {
      return false;
    }
  }

  assertReady(): void {
    if (!this.isTableAvailable()) {
      throw new Error("Access cache could not be initialized.");
    }
  }

  getCachedDirectory(): CloudAccessCacheReadResult | null {
    this.assertReady();

    const row = this.db
      .prepare(
        `SELECT directory_json, synced_at, schema_version
         FROM cloud_access_cache
         WHERE id = ?`,
      )
      .get(CACHE_ROW_ID) as
      | { directory_json: string; synced_at: string; schema_version: number }
      | undefined;

    if (!row || row.schema_version !== SCHEMA_VERSION) {
      return null;
    }

    try {
      const directory = JSON.parse(row.directory_json) as Record<string, unknown>;
      return { directory, syncedAt: row.synced_at };
    } catch {
      return null;
    }
  }

  replaceDirectory(directory: Record<string, unknown>, syncedAt: string): void {
    this.assertReady();

    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO cloud_access_cache (id, directory_json, synced_at, schema_version, updated_at)
           VALUES (?, ?, ?, ?, datetime('now'))
           ON CONFLICT(id) DO UPDATE SET
             directory_json = excluded.directory_json,
             synced_at = excluded.synced_at,
             schema_version = excluded.schema_version,
             updated_at = excluded.updated_at`,
        )
        .run(CACHE_ROW_ID, JSON.stringify(directory), syncedAt, SCHEMA_VERSION);
    });
  }

  clearCachedDirectory(): void {
    if (!this.isTableAvailable()) {
      return;
    }

    this.db.prepare(`DELETE FROM cloud_access_cache WHERE id = ?`).run(CACHE_ROW_ID);
  }

  getCacheMetadata(): { rowCount: number; syncedAt: string | null } {
    if (!this.isTableAvailable()) {
      return { rowCount: 0, syncedAt: null };
    }

    const row = this.db
      .prepare(`SELECT synced_at FROM cloud_access_cache WHERE id = ?`)
      .get(CACHE_ROW_ID) as { synced_at?: string } | undefined;

    return {
      rowCount: row ? 1 : 0,
      syncedAt: row?.synced_at ?? null,
    };
  }
}
