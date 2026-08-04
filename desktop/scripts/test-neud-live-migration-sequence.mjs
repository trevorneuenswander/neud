#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { migrationChecksum } from "../../scripts/live-validation/lib/migrations.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const EXPECTED_LIVE_MIGRATION_SEQUENCE = [
  "016_project_publishing_foundation.sql",
  "017_project_publishing_rpcs.sql",
  "022_restore_hosted_project_foundation.sql",
  "018_project_publishing_secure_auth.sql",
  "019_desktop_authenticated_cloud_auth.sql",
  "020_owner_project_registration.sql",
  "021_cloud_project_registration_hardening.sql",
  "023_rpc_grant_hardening.sql",
  "024_display_online_viewer.sql",
  "025_display_online_viewer_eligibility.sql",
  "026_fix_viewer_bundle_rpc.sql",
  "027_viewer_bundle_publisher_heartbeat.sql",
  "028_viewer_status_semantics.sql",
  "029_list_project_active_displays.sql",
  "030_harden_project_active_displays.sql",
  "031_project_display_sort_order.sql",
  "032_project_photo_assets.sql",
  "033_teams_foundation.sql",
  "034_project_team_assignments.sql",
  "035_cloud_invitations.sql",
  "036_access_management_rpcs.sql",
  "037_access_activity_events.sql",
  "038_access_management_rls.sql",
  "039_project_photo_delivery.sql",
  "040_access_management_mutations.sql",
  "041_access_invitation_completion.sql",
  "042_fix_access_management_directory.sql",
  "043_filter_access_management_directory.sql",
  "044_exclude_validation_fixtures_from_directory.sql",
  "045_access_role_model.sql",
  "046_team_assigned_project_access.sql",
  "047_centralize_project_access_management.sql",
  "048_activity_actor_resolution.sql",
  "049_display_enabled_activity_events.sql",
  "050_activity_sync_allowlist_extensions.sql",
];

const LIVE_APPLIED_029_CHECKSUM =
  "37c38c4b757d1099b1113ca17f1a8da7a059e80c24ad8b4d283f20287eaf2d8b";

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function parseLiveMigrationSequence(applyScript) {
  const match = applyScript.match(/const migrationFiles = \[([\s\S]*?)\];/);
  assert.ok(match, "apply-migrations.mjs must declare migrationFiles array");
  const entries = [...match[1].matchAll(/"([^"]+\.sql)"/g)].map((entry) => entry[1]);
  assert.ok(entries.length > 0, "migrationFiles must list at least one migration");
  return entries;
}

test("live apply script includes the full required migration sequence through 050", () => {
  const applyScript = read("scripts/live-validation/apply-migrations.mjs");
  const sequence = parseLiveMigrationSequence(applyScript);
  assert.deepEqual(sequence, EXPECTED_LIVE_MIGRATION_SEQUENCE);
});

test("each live migration file exists under supabase/migrations", () => {
  for (const fileName of EXPECTED_LIVE_MIGRATION_SEQUENCE) {
    const filePath = path.join(repoRoot, "supabase", "migrations", fileName);
    assert.ok(fs.existsSync(filePath), `Missing migration file: ${fileName}`);
  }
});

test("migration tracking records migration_name in public._neud_validation_migrations", () => {
  const migrationsLib = read("scripts/live-validation/lib/migrations.mjs");
  assert.match(migrationsLib, /TRACKING_TABLE = "_neud_validation_migrations"/);
  assert.match(migrationsLib, /migration_name text primary key/);
  assert.match(migrationsLib, /where migration_name = \$1/);
  assert.match(migrationsLib, /entry\.migration_name === fileName/);
  assert.match(migrationsLib, /insert into public\.\$\{TRACKING_TABLE\} \(migration_name, checksum/);
  assert.match(migrationsLib, /existing && existing\.checksum !== checksum/);
});

test("027 migration file defines heartbeat-based viewer bundle RPC", () => {
  const migration = read("supabase/migrations/027_viewer_bundle_publisher_heartbeat.sql");
  assert.match(migration, /027_viewer_bundle_publisher_heartbeat\.sql/);
  assert.match(migration, /last_heartbeat_at/);
  assert.match(migration, /publisher_online/);
});

test("028 migration file defines viewer status semantics RPC updates", () => {
  const migration = read("supabase/migrations/028_viewer_status_semantics.sql");
  assert.match(migration, /028_viewer_status_semantics\.sql/);
  assert.match(migration, /canonical_data_present/);
  assert.doesNotMatch(migration, /interval '5 minutes'/);
});

test("029 remains the immutable originally applied baseline migration", () => {
  const migration = read("supabase/migrations/029_list_project_active_displays.sql");
  assert.match(migration, /029_list_project_active_displays\.sql/);
  assert.match(migration, /create or replace function public\.list_project_active_displays\(p_project_id uuid\)/);
  assert.doesNotMatch(migration, /online_publish_error/);
  assert.doesNotMatch(migration, /revoke execute on function public\.list_project_active_displays\(uuid\) from anon/);
  assert.equal(
    migrationChecksum(migration),
    LIVE_APPLIED_029_CHECKSUM,
    "local 029 checksum must match live applied checksum",
  );
});

test("030 migration file contains post-029 hardening changes", () => {
  const migration = read("supabase/migrations/030_harden_project_active_displays.sql");
  assert.match(migration, /030_harden_project_active_displays\.sql/);
  assert.match(migration, /drop function if exists public\.list_project_active_displays\(uuid\)/);
  assert.match(migration, /online_publish_error/);
  assert.match(migration, /revoke execute on function public\.list_project_active_displays\(uuid\) from anon/);
  assert.match(
    migration,
    /revoke execute on function public\.list_project_active_displays\(uuid\) from service_role/,
  );
});

test("031 migration file defines display sort order and reorder RPC", () => {
  const migration = read("supabase/migrations/031_project_display_sort_order.sql");
  assert.match(migration, /031_project_display_sort_order\.sql/);
  assert.match(migration, /reorder_project_displays/);
  assert.match(migration, /can_operate_project/);
  assert.match(migration, /sort_order/);
  assert.match(migration, /order by d\.sort_order nulls last/);
});
