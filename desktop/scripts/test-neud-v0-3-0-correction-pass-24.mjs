#!/usr/bin/env node
/**
 * NEUD v0.3.0 Correction Pass 24 —
 * Stream Bid font diag + Live Chat Activity allowlist + Zoom on Live Chat page.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

test("STREAM BID: titleFontDiag compares production path with DOM controls", () => {
  const html = read("desktop/src/displays/bundled/stream-bid-display-v1.html");
  assert.match(html, /titleFontDiag/);
  assert.match(html, /runTitleFontDiagnostic/);
  assert.match(html, /TITLE_FONT_DIAG_PROBE\s*=\s*"1987 Mercedes-Benz 560 SLygjpq"/);
  assert.match(html, /titleFixture/);
  assert.match(html, /resolveTitleFixtureText/);
  assert.match(html, /TITLE_FIXTURE_DEFAULT\s*=\s*"1987 Mercedes-Benz 560 SLygjpq"/);
  assert.doesNotMatch(html, /console\.info\("\[neud-stream-bid-fixture\]"/);
  assert.match(html, /Helvetica, Arial, sans-serif/);
  assert.match(html, /Arial, sans-serif/);
  assert.match(html, /system-ui, sans-serif/);
  assert.match(html, /Helvetica Neue/);
  assert.match(html, /actualBoundingBoxDescent/);
  assert.match(html, /data-title-production-geometry/);
  assert.match(html, /bottomSafePx/);
  assert.match(html, /TITLE_DESCENDER_CLEARANCE_RATIO/);
  assert.match(html, /TITLE_LAYOUT_FONT_FAMILY\s*=\s*"Helvetica, Arial, sans-serif"/);
  assert.match(html, /TITLE_FONT_FAMILY\s*=\s*'"Helvetica Neue", Arial, sans-serif'/);
  assert.match(html, /titleFontCss\(sizePx, family(?:, weight)?\)/);
  assert.doesNotMatch(html, /TITLE_FONT_FAMILY\s*=\s*["']Arial/);
  assert.doesNotMatch(html, /TITLE_FONT_FAMILY\s*=\s*"Helvetica, Arial, sans-serif"/);
  assert.match(html, /imageSmoothingEnabled = true/);
  assert.match(html, /imageSmoothingQuality = "high"/);
  assert.doesNotMatch(html, /imageSmoothingEnabled = false/);
  assert.doesNotMatch(html, /image-rendering:\s*pixelated/);
  assert.match(html, /CANVAS_W = 3840/);
  assert.match(html, /CANVAS_H = 2160/);
  assert.match(html, /TITLE_SIZE_MAX = 120/);
  assert.match(html, /TITLE_SIZE_MIN = 72/);
  assert.match(html, /if \(fixtureText != null\)/);
});

test("ACTIVITY: live-chat lifecycle types on local + web allowlists", () => {
  for (const file of [
    "src/lib/activity/sync-allowlist.ts",
    "desktop/src/lib/activity/sync-allowlist.ts",
  ]) {
    const src = read(file);
    assert.match(src, /"live-chat\.connected"/);
    assert.match(src, /"live-chat\.disconnected"/);
    assert.match(src, /"live-chat\.mode_changed"/);
  }
});

test("ACTIVITY: migration 064 adds Live Chat types without rewriting old migrations", () => {
  assert.ok(exists("supabase/migrations/064_live_chat_activity_events.sql"));
  const migration = read("supabase/migrations/064_live_chat_activity_events.sql");
  assert.match(migration, /live-chat\.connected/);
  assert.match(migration, /live-chat\.disconnected/);
  assert.match(migration, /live-chat\.mode_changed/);
  assert.match(migration, /upsert_activity_events_for_sync/);
  // Preserve prior allowlist members.
  assert.match(migration, /display\.enabled/);
  assert.match(migration, /user\.deleted/);
});

test("ACTIVITY: friendly Live Chat copy + no per-message Activity", () => {
  const service = read("desktop/src/live-chat/live-chat-service.ts");
  assert.match(service, /Live Chat mode changed to \$\{/);
  assert.match(service, /Producer|Automatic/);
  assert.match(service, /Live Chat connected to/);
  assert.match(service, /Live Chat disconnected from/);
  assert.match(service, /safeRecordActivity/);
  assert.doesNotMatch(service, /type:\s*["']live-chat\.message/);
  const handleStart = service.indexOf("private handleIncoming(");
  assert.ok(handleStart >= 0);
  const handleBody = service.slice(handleStart, handleStart + 800);
  assert.doesNotMatch(handleBody, /safeRecordActivity|activityRecorder/);
});

test("ZOOM: removed from global Settings; present on Live Chat page", () => {
  const settings = read("src/app/(portal)/settings/page.tsx");
  assert.doesNotMatch(settings, /ZoomIntegrationsSection/);
  const client = read("src/components/live-chat/LiveChatClient.tsx");
  assert.match(client, /Zoom Connection/);
  assert.match(client, /Connect Zoom/);
  assert.match(client, /Developer Setup/);
  assert.match(client, /Save Zoom OAuth Settings|Save Public Client ID|Save App Credentials/);
  assert.match(client, /stored securely on this computer/);
  assert.match(client, /Zoom is not connected/);
  assert.match(client, /Source Type/);
  assert.doesNotMatch(client, /settings#zoom-integrations/);
  assert.doesNotMatch(client, /Account ID/);
});

test("ZOOM: machine-level safeStorage path unchanged", () => {
  const store = read("desktop/src/integrations/zoom/zoom-credential-store.ts");
  assert.match(store, /safeStorage/);
  assert.match(store, /zoom-app\.cred/);
  assert.match(store, /credentialsDir/);
  const api = read("desktop/src/services/local-api-server.ts");
  assert.match(api, /\/api\/integrations\/zoom/);
  assert.match(api, /getPublicStatus/);
  const publicStatus = read("desktop/src/integrations/zoom/zoom-types.ts");
  assert.match(publicStatus, /maskSecret/);
});

test("ZOOM: Manager configure vs Operator connect permissions", () => {
  const client = read("src/components/live-chat/LiveChatClient.tsx");
  assert.match(client, /canConfigure/);
  assert.match(client, /canOperate/);
  assert.match(client, /disabled=\{!\s*canOperate/);
  assert.match(client, /showDeveloperSetup/);
  assert.match(client, /Connect Zoom/);
  const page = read("src/app/(portal)/projects/[slug]/live-chat/page.tsx");
  assert.match(page, /canManageProjectSettings/);
  assert.match(page, /canOperateProjectDisplays/);
});
