#!/usr/bin/env node
/**
 * One-time migration: upload existing local Activity events to Supabase.
 *
 * Usage:
 *   npm run migrate:activity-to-cloud -- --dry-run
 *   npm run migrate:activity-to-cloud -- --batch-size=50
 *   npm run migrate:activity-to-cloud -- --resume
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import initSqlJs from "sql.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(repoRoot, ".env.local") });

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const resume = args.includes("--resume");
const batchSizeArg = args.find((arg) => arg.startsWith("--batch-size"));
const batchSize = batchSizeArg
  ? Number.parseInt(batchSizeArg.split("=")[1] ?? batchSizeArg.split("=")[0], 10)
  : 50;

function deterministicActivityCloudId(instanceId, localId) {
  const hash = createHash("sha256")
    .update(`neud:activity:${instanceId}:${localId}`)
    .digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    ((Number.parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0") +
      hash.slice(18, 20),
    hash.slice(20, 32),
  ].join("-");
}

function resolveDatabasePath() {
  const appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
  return path.join(appData, "NEUD", "data", "neud.sqlite");
}

function readInstanceId(db) {
  const row = db.exec("SELECT value_json FROM app_settings WHERE key = 'neud.instanceId' LIMIT 1");
  if (row[0]?.values?.[0]?.[0]) {
    return String(row[0].values[0][0]).replace(/^"|"$/g, "");
  }
  const instanceId = randomUUID();
  if (!dryRun) {
    db.run(
      "INSERT OR REPLACE INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?)",
      ["neud.instanceId", JSON.stringify(instanceId), new Date().toISOString()],
    );
  }
  return instanceId;
}

function cleanDescription(description, actorName) {
  const trimmed = String(description ?? "").trim();
  const actor = String(actorName ?? "").trim();
  if (!trimmed || !actor) return trimmed;
  const escaped = actor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const withoutActor = trimmed
    .replace(new RegExp(`^${escaped}(?:\\s*(?:[—–-]|:)\\s*|\\s+)`, "i"), "")
    .trim();
  const next = withoutActor || trimmed;
  return next.charAt(0).toUpperCase() + next.slice(1);
}

function parseActor(actorJson) {
  if (!actorJson) return { id: null, name: null };
  try {
    const parsed = JSON.parse(actorJson);
    return {
      id: typeof parsed.id === "string" ? parsed.id : null,
      name: typeof parsed.name === "string" ? parsed.name : null,
    };
  } catch {
    return { id: null, name: null };
  }
}

function parseMetadata(metadataJson) {
  if (!metadataJson) return {};
  try {
    const parsed = JSON.parse(metadataJson);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function getTableColumns(db, tableName) {
  const result = db.exec(`PRAGMA table_info(${tableName})`);
  const columns = result[0]?.columns ?? [];
  const values = result[0]?.values ?? [];
  return values.map((row) =>
    Object.fromEntries(columns.map((column, index) => [column, row[index]])),
  );
}

function ensureLocalActivitySyncSchema(db, { dryRun, databasePath }) {
  const existing = new Set(getTableColumns(db, "activity_events").map((column) => column.name));
  const requiredColumns = [
    ["cloud_id", "TEXT"],
    ["sync_status", "TEXT NOT NULL DEFAULT 'pending'"],
    ["sync_attempt_count", "INTEGER NOT NULL DEFAULT 0"],
    ["last_sync_attempt_at", "TEXT"],
    ["synced_at", "TEXT"],
    ["sync_error", "TEXT"],
    ["source_instance_id", "TEXT"],
    ["cloud_updated_at", "TEXT"],
  ];

  const missing = requiredColumns.filter(([name]) => !existing.has(name));
  if (missing.length === 0) {
    return false;
  }

  console.info(
    `[migrate:activity-to-cloud] applying local schema migration (017_activity_sync): missing=${missing.map(([name]) => name).join(", ")}`,
  );

  if (dryRun) {
    return true;
  }

  const backupDir = path.join(path.dirname(databasePath), "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `pre-activity-sync-schema-${stamp}.sqlite`);
  fs.copyFileSync(databasePath, backupPath);
  console.info(`[migrate:activity-to-cloud] schema backup=${backupPath}`);

  for (const [name, definition] of missing) {
    db.run(`ALTER TABLE activity_events ADD COLUMN ${name} ${definition}`);
  }

  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_events_cloud_id
      ON activity_events (cloud_id)
      WHERE cloud_id IS NOT NULL
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_activity_events_sync_status
      ON activity_events (sync_status, last_sync_attempt_at)
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_activity_events_cloud_updated_at
      ON activity_events (cloud_updated_at DESC)
  `);

  const migrationTable = db.exec(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
  );
  if (migrationTable.length > 0) {
    db.run(
      "INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (?, ?)",
      [17, "017_activity_sync.sql"],
    );
  }

  fs.writeFileSync(databasePath, Buffer.from(db.export()));
  return true;
}

function toCloudRow(record, instanceId) {
  const metadata = parseMetadata(record.metadata_json);
  const actor = parseActor(record.actor_json);
  const projectId =
    typeof metadata.projectId === "string" && metadata.projectId.trim()
      ? metadata.projectId.trim()
      : null;
  const teamId =
    typeof metadata.teamId === "string" && metadata.teamId.trim()
      ? metadata.teamId.trim()
      : null;
  const description = cleanDescription(record.message, actor.name);

  return {
    id: record.cloud_id,
    project_id: projectId,
    team_id: teamId,
    user_id: actor.id,
    actor_display_name: actor.name,
    event_type: record.type,
    description,
    metadata: { ...metadata, description },
    source: record.source,
    severity: record.severity ?? "info",
    source_instance_id: record.source_instance_id ?? instanceId,
    source_local_id: record.id,
    occurred_at: record.timestamp,
    created_at: record.timestamp,
    updated_at: record.timestamp,
    deleted_at: null,
  };
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const databasePath = resolveDatabasePath();
  if (!fs.existsSync(databasePath)) {
    console.error(`Local database not found: ${databasePath}`);
    process.exit(1);
  }

  const SQL = await initSqlJs({
    locateFile: (file) =>
      path.join(repoRoot, "node_modules", "sql.js", "dist", file),
  });
  const fileBuffer = fs.readFileSync(databasePath);
  const db = new SQL.Database(fileBuffer);

  const instanceId = readInstanceId(db);
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  ensureLocalActivitySyncSchema(db, { dryRun, databasePath });

  const rowsResult = db.exec("SELECT * FROM activity_events ORDER BY sequence_id ASC");
  const columns = rowsResult[0]?.columns ?? [];
  const values = rowsResult[0]?.values ?? [];
  const records = values.map((row) =>
    Object.fromEntries(columns.map((column, index) => [column, row[index]])),
  );

  let scanned = records.length;
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  let assignedCloudIds = 0;

  const needsCloudIdAssignment = records.some((record) => !record.cloud_id);
  if (!dryRun && needsCloudIdAssignment) {
    const backupDir = path.join(path.dirname(databasePath), "backups");
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(backupDir, `pre-activity-cloud-migration-${stamp}.sqlite`);
    fs.copyFileSync(databasePath, backupPath);
    console.info(`[migrate:activity-to-cloud] backup=${backupPath}`);
  }

  for (const record of records) {
    if (!record.cloud_id) {
      record.cloud_id = deterministicActivityCloudId(instanceId, record.id);
      assignedCloudIds += 1;
      if (!dryRun) {
        db.run(
          `UPDATE activity_events SET cloud_id = ?, source_instance_id = COALESCE(source_instance_id, ?), sync_status = CASE WHEN sync_status = 'synced' THEN sync_status ELSE 'pending' END WHERE id = ?`,
          [record.cloud_id, instanceId, record.id],
        );
      }
    }
  }

  const pending = resume
    ? records.filter((record) => record.sync_status !== "synced")
    : records;

  console.info(
    `[migrate:activity-to-cloud] dryRun=${dryRun} resume=${resume} batchSize=${batchSize} scanned=${scanned} pending=${pending.length} assignedCloudIds=${assignedCloudIds}`,
  );

  if (!dryRun && assignedCloudIds > 0) {
    fs.writeFileSync(databasePath, Buffer.from(db.export()));
  }

  for (let index = 0; index < pending.length; index += batchSize) {
    const batch = pending.slice(index, index + batchSize);
    const cloudRows = batch.map((record) => toCloudRow(record, instanceId));

    if (dryRun) {
      uploaded += cloudRows.length;
      continue;
    }

    const { error } = await supabase.from("activity_events").upsert(cloudRows, {
      onConflict: "id",
    });

    if (error) {
      failed += batch.length;
      console.error(`[migrate:activity-to-cloud] batch failed: ${error.message}`);
      continue;
    }

    const now = new Date().toISOString();
    for (const record of batch) {
      db.run(
        `UPDATE activity_events SET sync_status = 'synced', synced_at = ?, cloud_updated_at = ?, sync_error = NULL WHERE cloud_id = ?`,
        [now, now, record.cloud_id],
      );
    }
    uploaded += batch.length;
    fs.writeFileSync(databasePath, Buffer.from(db.export()));
    console.info(
      `[migrate:activity-to-cloud] progress uploaded=${uploaded} failed=${failed} remaining=${Math.max(0, pending.length - uploaded - failed)}`,
    );
  }

  db.close();

  console.info(
    `[migrate:activity-to-cloud] complete scanned=${scanned} uploaded=${uploaded} skipped=${skipped} failed=${failed}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
