#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertLiveValidationTarget,
  getRepoRoot,
  loadLiveValidationEnv,
} from "./lib/env.mjs";
import {
  applyMigrationFile,
  formatMigrationFailure,
  probeSchemaState,
} from "./lib/migrations.mjs";
import { sanitizeError } from "./lib/sanitize.mjs";

const repoRoot = getRepoRoot(import.meta.url);
const { validationEnvExists } = loadLiveValidationEnv(repoRoot);

const migrationFiles = [
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
  "051_project_marked_activity_events.sql",
];

async function main() {
  if (!validationEnvExists) {
    console.error("Missing .env.live-validation.local");
    console.error("Copy .env.live-validation.local.example and add NEUD_SUPABASE_DB_URL.");
    process.exit(1);
  }

  let target;
  try {
    target = assertLiveValidationTarget();
  } catch (error) {
    console.error(sanitizeError(error).message);
    process.exit(1);
  }

  console.log("Live validation preflight");
  console.log(`  expected project ref: ${target.expectedRef}`);
  console.log(`  public Supabase host: ${target.supabaseUrlHost}`);
  console.log(`  database host: ${target.dbHost}`);

  let pg;
  try {
    pg = await import("pg");
  } catch {
    console.error("Install pg first: npm install --save-dev pg");
    process.exit(1);
  }

  const dbUrl = process.env.NEUD_SUPABASE_DB_URL.trim();
  const client = new pg.default.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  const preflight = {
    projectRef: target.expectedRef,
    publicHost: target.supabaseUrlHost,
    dbHost: target.dbHost,
    startedAt: new Date().toISOString(),
    schemaBefore: null,
  };

  try {
    preflight.schemaBefore = await probeSchemaState(client);
    console.log("\nPre-migration schema probe:");
    console.log(`  tables: ${preflight.schemaBefore.presentTables.join(", ") || "(none)"}`);
    console.log(`  rpcs: ${preflight.schemaBefore.presentRpcs.join(", ") || "(none)"}`);
    if (preflight.schemaBefore.appliedMigrations.length > 0) {
      console.log(
        `  prior tracked migrations: ${preflight.schemaBefore.appliedMigrations.map((entry) => entry.migration_name).join(", ")}`,
      );
    }

    const results = [];
    for (const fileName of migrationFiles) {
      const filePath = path.join(repoRoot, "supabase", "migrations", fileName);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Missing migration file: ${fileName}`);
      }

      const sql = fs.readFileSync(filePath, "utf8");
      console.log(`\n→ ${fileName}`);
      try {
        const result = await applyMigrationFile(client, fileName, sql);
        results.push(result);
        console.log(result.skipped ? `↷ ${fileName} (already applied)` : `✔ ${fileName}`);
      } catch (error) {
        const failure = formatMigrationFailure(fileName, new Date().toISOString(), error);
        results.push(failure);
        console.error(`✖ ${fileName}: ${failure.error.message}`);
        break;
      }
    }

    const schemaAfter = await probeSchemaState(client);
    const output = {
      projectRef: target.expectedRef,
      publicHost: target.supabaseUrlHost,
      dbHost: target.dbHost,
      preflight,
      results,
      schemaAfter,
      completedAt: new Date().toISOString(),
    };

    const outputPath = path.join(repoRoot, "docs", "slice-2.3-migration-apply-log.json");
    fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    console.log(`\nWrote migration log to ${outputPath}`);

    if (results.some((entry) => !entry.ok)) {
      process.exit(1);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(sanitizeError(error).message);
  process.exit(1);
});
