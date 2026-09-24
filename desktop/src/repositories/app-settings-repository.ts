import type { LocalDatabase } from "../database/connection";

const appSettingsWriteMetrics = {
  writes: 0,
  skippedUnchanged: 0,
  byCategory: {} as Record<string, number>,
};

export function categorizeAppSettingsKey(key: string): string {
  const lower = key.toLowerCase();
  if (
    lower.includes("cloud") ||
    lower.includes("auth") ||
    lower.includes("session") ||
    key === "auth.explicitlySignedOut"
  ) {
    return "auth/session diagnostics";
  }
  if (lower.includes("identity") || lower.includes("sharedcloudauth")) {
    return "identity";
  }
  if (lower.includes("publishing")) {
    return "publishing";
  }
  if (lower.includes("displaysync") || lower.includes("display")) {
    return "display state";
  }
  if (lower.includes("activity")) {
    return "activity sync";
  }
  if (lower.includes("userdirectory") || lower.includes("directory")) {
    return "user directory";
  }
  if (lower.includes("localapi") || lower.includes("local_api")) {
    return "local api";
  }
  return "other";
}

export function getAppSettingsWriteMetrics(): typeof appSettingsWriteMetrics {
  return {
    writes: appSettingsWriteMetrics.writes,
    skippedUnchanged: appSettingsWriteMetrics.skippedUnchanged,
    byCategory: { ...appSettingsWriteMetrics.byCategory },
  };
}

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
    const nextJson = JSON.stringify(value);
    const existing = this.db
      .prepare("SELECT value_json FROM app_settings WHERE key = ?")
      .get(key) as { value_json: string } | undefined;
    if (existing?.value_json === nextJson) {
      appSettingsWriteMetrics.skippedUnchanged += 1;
      return;
    }

    appSettingsWriteMetrics.writes += 1;
    const category = categorizeAppSettingsKey(key);
    appSettingsWriteMetrics.byCategory[category] =
      (appSettingsWriteMetrics.byCategory[category] ?? 0) + 1;
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO app_settings (key, value_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value_json = excluded.value_json,
           updated_at = excluded.updated_at`,
      )
      .run(key, nextJson, now);
  }
}
