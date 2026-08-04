#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const acceptedOnlineViewerEvents = [
  "display.online_viewer_enabled",
  "display.online_viewer_disabled",
  "display.online_visibility_changed",
  "display.online_published",
  "display.online_publish_failed",
  "display.online_publish_resumed",
];

const rejectedProbeEvents = [
  "display.online_viewer_heartbeat",
  "display.canonical_payload_updated",
  "display.viewer_poll",
  "display.online_viewer_secret",
];

test("migration 024 allowlists dedicated online viewer activity events", () => {
  const migration = read("supabase/migrations/024_display_online_viewer.sql");
  for (const eventType of acceptedOnlineViewerEvents) {
    assert.match(migration, new RegExp(`'${eventType.replace(".", "\\.")}'`));
  }
});

test("migration 024 upsert activity RPC keeps authenticated-only grants", () => {
  const migration = read("supabase/migrations/024_display_online_viewer.sql");
  assert.match(migration, /revoke execute on function public\.upsert_activity_events_for_sync[^;]* from anon/);
  assert.match(migration, /revoke execute on function public\.upsert_activity_events_for_sync[^;]* from service_role/);
  assert.match(migration, /grant execute on function public\.upsert_activity_events_for_sync[^;]* to authenticated/);
});

test("migration 031 allowlists display order changed activity events", () => {
  const migration = read("supabase/migrations/031_project_display_sort_order.sql");
  assert.match(migration, /'display\.order_changed'/);
  assert.match(migration, /Reordered project displays\./);
});

test("rejected online viewer probe events are not allowlisted", () => {
  const migration = read("supabase/migrations/024_display_online_viewer.sql");
  for (const eventType of rejectedProbeEvents) {
    assert.doesNotMatch(migration, new RegExp(`'${eventType.replace(".", "\\.")}'`));
  }
});

test("desktop services emit accepted online viewer event types only", () => {
  const developerTools = read("desktop/src/services/developer-tools-service.ts");
  const displaySync = read("desktop/src/services/display-sync/display-sync-service.ts");
  const combined = `${developerTools}\n${displaySync}`;

  for (const eventType of acceptedOnlineViewerEvents) {
    assert.match(combined, new RegExp(eventType.replace(".", "\\.")));
  }

  for (const eventType of rejectedProbeEvents) {
    assert.doesNotMatch(combined, new RegExp(`type:\\s*"${eventType.replace(".", "\\.")}"`));
  }
});

test("online viewer activity metadata avoids secrets and raw payloads", () => {
  const developerTools = read("desktop/src/services/developer-tools-service.ts");
  const displaySync = read("desktop/src/services/display-sync/display-sync-service.ts");
  const combined = `${developerTools}\n${displaySync}`;

  assert.doesNotMatch(combined, /html_content/);
  assert.doesNotMatch(combined, /canonical_payload/);
  assert.doesNotMatch(combined, /serviceRole/);
  assert.doesNotMatch(combined, /service_role/);
});
