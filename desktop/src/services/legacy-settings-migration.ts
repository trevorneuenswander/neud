import type { LocalDatabase } from "../database/connection";

const LEGACY_SETTINGS_MIGRATION_KEY = "neud.legacySettingsMigrationCompleted";

const LEGACY_SETTING_KEY_MAP: Record<string, string> = {
  "hmg.localApiSessionToken": "neud.localApiSessionToken",
  "hmg.localIdentity": "neud.localIdentity",
};

export function migrateLegacyAppSettings(db: LocalDatabase): {
  scanned: number;
  updated: number;
} {
  const marker = db
    .prepare("SELECT value_json FROM app_settings WHERE key = ?")
    .get(LEGACY_SETTINGS_MIGRATION_KEY) as { value_json: string } | undefined;

  if (marker) {
    try {
      if (JSON.parse(marker.value_json) === "done") {
        return { scanned: 0, updated: 0 };
      }
    } catch {
      // Re-run if marker is unreadable.
    }
  }

  let scanned = 0;
  let updated = 0;

  db.transaction(() => {
    for (const [legacyKey, currentKey] of Object.entries(LEGACY_SETTING_KEY_MAP)) {
      scanned += 1;
      const legacyRow = db
        .prepare("SELECT value_json FROM app_settings WHERE key = ?")
        .get(legacyKey) as { value_json: string } | undefined;
      if (!legacyRow) {
        continue;
      }

      const currentRow = db
        .prepare("SELECT value_json FROM app_settings WHERE key = ?")
        .get(currentKey) as { value_json: string } | undefined;

      if (!currentRow) {
        db.prepare(
          `INSERT INTO app_settings (key, value_json, updated_at)
           VALUES (?, ?, datetime('now'))`,
        ).run(currentKey, legacyRow.value_json);
      }

      db.prepare("DELETE FROM app_settings WHERE key = ?").run(legacyKey);
      updated += 1;
    }

    db.prepare(
      `UPDATE teams SET name = ?, description = ?
       WHERE name IN ('HMG', 'NEUD') AND description LIKE 'Default %team%'`,
    ).run("Hildreth Media Group", "Default team for Hildreth Media Group within NEUD.");

    db.prepare(
      `INSERT INTO app_settings (key, value_json, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET
         value_json = excluded.value_json,
         updated_at = excluded.updated_at`,
    ).run(LEGACY_SETTINGS_MIGRATION_KEY, JSON.stringify("done"));
  });

  if (updated > 0) {
    console.info(`[SettingsMigration] scanned=${scanned} updated=${updated}`);
  }

  return { scanned, updated };
}
