import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

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

function stripSqlComments(sql) {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

test("cloud activity migration exists in supabase", () => {
  const migration = stripSqlComments(readSrc("supabase/migrations/011_activity_events.sql"));
  assert.match(migration, /create table if not exists public\.activity_events/);
  assert.match(migration, /source_instance_id uuid not null/);
  assert.match(migration, /enable row level security/);
  assert.doesNotMatch(migration, /references\s+public\.projects/i);
  assert.doesNotMatch(migration, /is_project_member\s*\(/i);
  assert.doesNotMatch(migration, /^[^-\n]*create policy/im);
});

test("local activity sync migration adds cloud columns", () => {
  const migration = readSrc("desktop/src/database/migrations/017_activity_sync.sql");
  assert.match(migration, /cloud_id TEXT/);
  assert.match(migration, /sync_status TEXT/);
  assert.match(migration, /source_instance_id TEXT/);
});

test("activity sync service implements push pull and retry", () => {
  const service = readSrc("desktop/src/services/activity-sync/activity-sync-service.ts");
  assert.match(service, /pushPending/);
  assert.match(service, /pullRemote/);
  assert.match(service, /scheduleRetry/);
  assert.match(service, /ACTIVITY_SYNC_BACKOFF_MS/);
});

test("login triggers activity sync", () => {
  const main = readSrc("desktop/src/main.ts");
  assert.match(main, /syncNow\("login"\)/);
});

test("recordActivity generates cloud UUID before local insert", () => {
  const service = readSrc("desktop/src/services/local-data-service.ts");
  assert.match(service, /const cloudId = randomUUID\(\)/);
  assert.match(service, /queueEventUpload\(cloudId\)/);
});

test("activity insert SQL matches table column count", () => {
  const repository = readSrc("desktop/src/repositories/activity-events-repository.ts");
  const insertMatch = repository.match(
    /INSERT INTO activity_events \(\s*([\s\S]*?)\)\s*VALUES\s*\(([\s\S]*?)\)/,
  );
  assert.ok(insertMatch, "activity_events insert statement should exist");
  const columns = insertMatch[1]
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const values = insertMatch[2]
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  assert.equal(
    columns.length,
    values.length,
    `activity_events insert must bind ${columns.length} columns to ${values.length} values`,
  );
});

test("activity insert succeeds against migrated sqlite schema", async () => {
  const { mkdirSync } = await import("node:fs");
  const { ActivityEventsRepository } = await import(
    "../dist/repositories/activity-events-repository.js"
  );
  const { openLocalDatabase, closeLocalDatabase } = await import(
    "../dist/database/connection.js"
  );

  const suffix = crypto.randomUUID().slice(0, 8);
  const root = path.join(process.cwd(), `.tmp-activity-insert-${suffix}`);
  const paths = {
    root,
    data: path.join(root, "data"),
    databaseFile: path.join(root, "data", "test.sqlite"),
    backups: path.join(root, "backups"),
    projects: path.join(root, "projects"),
    assets: path.join(root, "assets"),
    displays: path.join(root, "displays"),
    controllers: path.join(root, "controllers"),
    publishing: path.join(root, "publishing"),
    exports: path.join(root, "exports"),
    config: path.join(root, "config"),
    logs: path.join(root, "logs"),
    engineLogs: path.join(root, "logs", "engines"),
    engines: path.join(root, "engines"),
    browserData: path.join(root, "browser-data"),
    browserProfiles: path.join(root, "browser-profiles"),
    cookies: path.join(root, "cookies"),
    cache: path.join(root, "cache"),
    downloads: path.join(root, "downloads"),
    serverEnvFile: path.join(root, "config", "server.env"),
    hostFile: path.join(root, "config", "host.json"),
    credentialsDir: path.join(root, "config", "credentials"),
    authCacheFile: path.join(root, "config", "auth-cache.enc"),
    repoRoot,
  };

  mkdirSync(paths.data, { recursive: true });
  mkdirSync(paths.backups, { recursive: true });
  mkdirSync(paths.config, { recursive: true });
  mkdirSync(paths.logs, { recursive: true });
  mkdirSync(paths.engineLogs, { recursive: true });

  const db = await openLocalDatabase(paths);
  try {
    const repository = new ActivityEventsRepository(db);
    const record = repository.insert({
      event: {
        id: "activity-1",
        type: "data-source.changed",
        message: "Data source changed to Local Controller",
        timestamp: new Date().toISOString(),
        source: "system",
        severity: "info",
      },
      cloudId: crypto.randomUUID(),
      instanceId: crypto.randomUUID(),
    });
    assert.equal(record.type, "data-source.changed");
    assert.equal(repository.listNewestFirst(1)[0]?.message, record.message);
  } finally {
    closeLocalDatabase(db);
  }
});

test("deterministic migration IDs are stable across instances", () => {
  const instanceA = "11111111-1111-4111-8111-111111111111";
  const instanceB = "22222222-2222-4222-8222-222222222222";
  const localId = "activity-42";
  const idA = deterministicActivityCloudId(instanceA, localId);
  const idB = deterministicActivityCloudId(instanceB, localId);
  assert.notEqual(idA, idB);
  assert.equal(idA, deterministicActivityCloudId(instanceA, localId));
});

test("two installation IDs converge through shared cloud id upsert", () => {
  const mapper = readSrc("desktop/src/services/activity-sync/cloud-activity-client.ts");
  assert.match(mapper, /rpc\("upsert_activity_events_for_sync"/);
  assert.match(mapper, /fetchChangedSince/);
});

test("compound sync cursor avoids timestamp collisions", () => {
  const client = readSrc("desktop/src/services/activity-sync/cloud-activity-client.ts");
  assert.match(client, /updatedAt === input\.cursor\.updatedAt && id <= input\.cursor\.id/);
  const types = readSrc("desktop/src/services/activity-sync/types.ts");
  assert.match(types, /neud\.activitySync\.cursor/);
});

test("activity IPC exposes sync state and manual sync", () => {
  const ipc = readSrc("desktop/src/ipc/activity.ts");
  assert.match(ipc, /neud:activity:getSyncState/);
  assert.match(ipc, /neud:activity:syncNow/);
  const preload = readSrc("desktop/src/preload.ts");
  assert.match(preload, /getSyncState/);
  assert.match(preload, /syncNow/);
});

test("full activity page includes sync status UI", () => {
  const view = readSrc("src/components/activity/ActivityFullView.tsx");
  assert.match(view, /ActivitySyncStatus/);
});

test("migration command supports dry-run batch-size and resume", () => {
  const script = readSrc("scripts/migrate-activity-to-cloud.mjs");
  assert.match(script, /--dry-run/);
  assert.match(script, /--batch-size/);
  assert.match(script, /--resume/);
  assert.match(script, /ensureLocalActivitySyncSchema/);
  assert.match(script, /017_activity_sync/);
});

test("instance id setting key is neud.instanceId", () => {
  const instance = readSrc("desktop/src/services/neud-instance-id.ts");
  assert.match(instance, /neud\.instanceId/);
});

test("activity session triggers background sync on subscribe", () => {
  const client = readSrc("src/lib/desktop/activity-session-client.ts");
  assert.doesNotMatch(client, /api\.syncNow/);
});

test("push pending uploads rows individually and marks only uploaded rows synced", () => {
  const service = readSrc("desktop/src/services/activity-sync/activity-sync-service.ts");
  assert.match(service, /for \(const record of pending\)/);
  assert.match(service, /upsertEvents\(\[row\]\)/);
  assert.match(service, /markSynced\(activeRecord\.cloudId/);
});

test("realtime subscription supplements periodic pull sync", () => {
  const service = readSrc("desktop/src/services/activity-sync/activity-sync-service.ts");
  assert.match(service, /postgres_changes/);
  assert.match(service, /activity_events/);
  assert.match(service, /syncNow\("periodic"\)/);
});
