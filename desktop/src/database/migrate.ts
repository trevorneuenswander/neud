import fs from "fs";
import path from "path";
import { backupDatabase } from "./backup";
import type { LocalDatabase } from "./connection";
import type { AppPaths } from "../services/app-paths";

type MigrationRecord = {
  version: number;
  name: string;
};

const MIGRATION_FILES = [
  "001_initial_schema.sql",
  "002_import_history.sql",
  "003_bag_live_state.sql",
  "004_bag_manual_mode.sql",
  "005_engine_status_diagnostics.sql",
  "006_activity_events.sql",
  "007_local_controller_draft.sql",
  "008_manual_lot_navigation.sql",
  "009_project_is_active.sql",
  "010_local_project_memberships.sql",
  "011_project_developer_code.sql",
  "012_display_order_and_photo_overrides.sql",
  "013_revision_names.sql",
  "014_teams_and_access.sql",
  "015_project_team_assignments.sql",
  "016_user_display_order_and_user_soft_delete.sql",
  "017_activity_sync.sql",
  "018_local_users_phone.sql",
  "019_supabase_user_link.sql",
  "020_supabase_user_sync.sql",
  "021_display_refresh_rate.sql",
  "022_display_archive_metadata.sql",
  "023_display_size.sql",
  "024_display_sync.sql",
  "025_display_data_mappings.sql",
  "026_drop_display_data_mappings.sql",
  "027_display_revision_version_number.sql",
  "028_display_runtime_adapter_key.sql",
  "029_legacy_pylon_runtime_adapter.sql",
  "030_auth_cache_team.sql",
  "031_auth_cache_supabase_identity.sql",
  "032_local_users_profile_team.sql",
  "033_display_online_viewer.sql",
  "034_project_photo_uploads.sql",
  "035_cloud_access_cache.sql",
];

export function runMigrations(db: LocalDatabase, paths: AppPaths): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    (
      db
        .prepare("SELECT version FROM schema_migrations ORDER BY version")
        .all() as MigrationRecord[]
    ).map((row) => row.version),
  );

  const pending = MIGRATION_FILES.filter((file) => {
    const version = parseMigrationVersion(file);
    return !applied.has(version);
  });

  if (pending.length === 0) {
    return;
  }

  if (fs.existsSync(paths.databaseFile)) {
    backupDatabase(paths, "schema-migration");
  }

  const migrationsDir = path.join(__dirname, "migrations");
  for (const file of pending) {
    const version = parseMigrationVersion(file);
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    db.exec(sql);
    db.prepare("INSERT INTO schema_migrations (version, name) VALUES (?, ?)").run(
      version,
      file,
    );
  }
}

function parseMigrationVersion(filename: string): number {
  const match = filename.match(/^(\d+)_/);
  if (!match) {
    throw new Error(`Invalid migration filename: ${filename}`);
  }
  return Number(match[1]);
}
