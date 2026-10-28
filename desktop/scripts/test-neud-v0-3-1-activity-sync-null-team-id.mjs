#!/usr/bin/env node
/**
 * v0.3.1 — SEMA activity with NULL team_id must still sync.
 *
 * Confirms cloud pull/mapper/UI filters do not require team_id, and that
 * project-id alias mapping remains the acceptance path for mismatched UUIDs.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8").replace(/\r\n/g, "\n");
}

const SEMA_CLOUD_ID = "5e0a0001-0000-4000-8000-000000000001";
const SEMA_LOCAL_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

async function loadMapper() {
  const candidates = [
    path.join(repoRoot, "desktop/dist/services/activity-sync/cloud-activity-mapper.js"),
    path.join(repoRoot, "desktop/src/services/activity-sync/cloud-activity-mapper.ts"),
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      return await import(pathToFileURL(candidate).href);
    } catch {
      // try next
    }
  }
  return null;
}

async function loadAliases() {
  const candidates = [
    path.join(repoRoot, "desktop/dist/services/activity-sync/project-id-aliases.js"),
    path.join(repoRoot, "desktop/src/services/activity-sync/project-id-aliases.ts"),
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      return await import(pathToFileURL(candidate).href);
    } catch {
      // try next
    }
  }
  return null;
}

test("cloud activity client filters by project_id only — never team_id", () => {
  const client = read("desktop/src/services/activity-sync/cloud-activity-client.ts");
  assert.match(client, /accessible\.has\(row\.project_id\)/);
  assert.doesNotMatch(client, /team_id/);
  assert.doesNotMatch(client, /row\.team/);
});

test("activity sync service documents NULL team_id acceptance", () => {
  const service = read("desktop/src/services/activity-sync/activity-sync-service.ts");
  assert.match(service, /team_id may be NULL/i);
  assert.match(service, /do not require it/i);
});

test("mapper round-trips SEMA cloud row with null team_id and remaps project", async () => {
  const mapper = await loadMapper();
  const aliases = await loadAliases();
  assert.ok(mapper?.fromCloudActivityRow);
  assert.ok(aliases?.buildActivityPullProjectScope);
  assert.ok(aliases?.remapCloudActivityProjectId);

  const scope = aliases.buildActivityPullProjectScope({
    accessibleLocalProjectIds: [SEMA_LOCAL_ID],
    directoryEntries: [{ cloudProjectId: SEMA_CLOUD_ID, localProjectId: SEMA_LOCAL_ID, slug: "sema" }],
    localProjects: [{ id: SEMA_LOCAL_ID, slug: "sema" }],
  });

  const row = {
    id: "11111111-2222-4333-8444-555555555555",
    project_id: SEMA_CLOUD_ID,
    team_id: null,
    user_id: "user-1",
    actor_display_name: "Operator",
    event_type: "manual.override",
    description: "SEMA schedule moved forward.",
    metadata: { projectId: SEMA_CLOUD_ID },
    source: "desktop",
    severity: "info",
    source_instance_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    source_local_id: "local-1",
    occurred_at: "2026-10-26T12:00:00.000Z",
    created_at: "2026-10-26T12:00:00.000Z",
    updated_at: "2026-10-26T12:00:00.000Z",
    deleted_at: null,
  };

  assert.ok(scope.accessibleQueryIds.includes(row.project_id));
  const event = mapper.fromCloudActivityRow(row);
  assert.equal(event.metadata.teamId, undefined);
  event.metadata = aliases.remapCloudActivityProjectId(
    event.metadata ?? {},
    row.project_id,
    scope.cloudToLocal,
  );
  assert.equal(event.metadata.projectId, SEMA_LOCAL_ID);
});

test("activity page project filter uses metadata.projectId — not team", () => {
  const filter = read("src/lib/activity/filter.ts");
  assert.match(filter, /projectId/);
  assert.doesNotMatch(filter, /teamId|team_id/);
});

test("RLS select policy gates on project membership — not event team_id", () => {
  const policy = read("supabase/migrations/019_desktop_authenticated_cloud_auth.sql");
  assert.match(policy, /activity_events_select/);
  assert.match(policy, /can_view_project\(project_id\)/);
  assert.doesNotMatch(
    policy.slice(policy.indexOf("activity_events_select"), policy.indexOf("activity_events_select") + 800),
    /team_id/,
  );
});
