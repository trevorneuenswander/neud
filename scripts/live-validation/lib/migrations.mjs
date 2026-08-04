import crypto from "node:crypto";
import { sanitizeError } from "./sanitize.mjs";

const TRACKING_TABLE = "_neud_validation_migrations";

export { TRACKING_TABLE };

export async function isMigrationApplied(client, migrationName) {
  await ensureTrackingTable(client);
  const { rows } = await client.query(
    `select migration_name from public.${TRACKING_TABLE} where migration_name = $1 limit 1`,
    [migrationName],
  );
  return rows.length > 0;
}

export async function ensureTrackingTable(client) {
  await client.query(`
    create table if not exists public.${TRACKING_TABLE} (
      migration_name text primary key,
      checksum text not null,
      applied_at timestamptz not null default now(),
      completed_at timestamptz not null default now()
    );
  `);
}

export function migrationChecksum(sql) {
  return crypto.createHash("sha256").update(sql).digest("hex");
}

export async function getAppliedMigrations(client) {
  await ensureTrackingTable(client);
  const { rows } = await client.query(
    `select migration_name, checksum, applied_at, completed_at from public.${TRACKING_TABLE} order by applied_at`,
  );
  return rows;
}

export async function recordMigration(client, fileName, checksum, startedAt) {
  await client.query(
    `
      insert into public.${TRACKING_TABLE} (migration_name, checksum, applied_at, completed_at)
      values ($1, $2, $3, now())
      on conflict (migration_name) do update
      set checksum = excluded.checksum,
          completed_at = excluded.completed_at
    `,
    [fileName, checksum, startedAt],
  );
}

export async function probeSchemaState(client) {
  const checks = {};

  const tableQuery = `
    select tablename
    from pg_tables
    where schemaname = 'public'
      and tablename in (
        'project_publishing_settings',
        'project_publisher_leases',
        'project_canonical_snapshots',
        'cloud_project_registration_audit',
        'displays',
        'display_revisions',
        'profiles',
        'projects',
        'project_members',
        'activity_events'
      )
    order by tablename;
  `;

  const { rows: tables } = await client.query(tableQuery);
  checks.presentTables = tables.map((row) => row.tablename);

  const rpcQuery = `
    select p.proname as function_name
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'register_hosted_project_for_desktop',
        'can_create_cloud_project',
        'acquire_project_publisher_lease',
        'publish_project_canonical_snapshot',
        'upsert_activity_events_for_sync',
        'get_authorized_users_directory',
        'get_accessible_project_users_directory'
      )
    order by p.proname;
  `;

  const { rows: rpcs } = await client.query(rpcQuery);
  checks.presentRpcs = rpcs.map((row) => row.function_name);

  const { rows: applied } = await client.query(
    `select to_regclass('public.${TRACKING_TABLE}') as tracking_table`,
  );
  checks.trackingTable = applied[0]?.tracking_table !== null;

  if (checks.trackingTable) {
    checks.appliedMigrations = await getAppliedMigrations(client);
  } else {
    checks.appliedMigrations = [];
  }

  return checks;
}

export async function applyMigrationFile(client, fileName, sql) {
  const checksum = migrationChecksum(sql);
  const startedAt = new Date().toISOString();

  const applied = await getAppliedMigrations(client);
  const existing = applied.find((entry) => entry.migration_name === fileName);
  if (existing?.checksum === checksum) {
    return {
      fileName,
      ok: true,
      skipped: true,
      startedAt,
      completedAt: new Date().toISOString(),
      checksum,
      note: "Already applied with matching checksum",
    };
  }

  if (existing && existing.checksum !== checksum) {
    throw new Error(
      `${fileName} was previously applied with a different checksum. Restore database before retrying.`,
    );
  }

  await client.query("begin");
  try {
    await client.query(sql);
    await recordMigration(client, fileName, checksum, startedAt);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }

  return {
    fileName,
    ok: true,
    skipped: false,
    startedAt,
    completedAt: new Date().toISOString(),
    checksum,
  };
}

export function formatMigrationFailure(fileName, startedAt, error) {
  return {
    fileName,
    ok: false,
    startedAt,
    completedAt: new Date().toISOString(),
    error: sanitizeError(error),
    rollbackRequired: true,
  };
}
