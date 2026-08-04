import type { LocalDatabase } from "../database/connection";

export class AppSettingsRepository {
  constructor(private readonly db: LocalDatabase) {}

  get<T>(key: string, fallback: T): T {
    const row = this.db
      .prepare("SELECT value_json FROM app_settings WHERE key = ?")
      .get(key) as { value_json: string } | undefined;

    if (!row) return fallback;

    try {
      return JSON.parse(row.value_json) as T;
    } catch {
      return fallback;
    }
  }

  set(key: string, value: unknown): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO app_settings (key, value_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value_json = excluded.value_json,
           updated_at = excluded.updated_at`,
      )
      .run(key, JSON.stringify(value), now);
  }
}
