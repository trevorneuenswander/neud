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

test("online viewer toggle is disabled when local display is off", () => {
  const toggle = read("src/components/displays/OnlineViewerToggle.tsx");
  const hook = read("src/lib/displays/use-online-viewer-settings.ts");
  const controls = read("src/components/displays/DisplayCardControls.tsx");
  assert.match(toggle, /displayEnabled/);
  assert.match(toggle, /!displayEnabled/);
  assert.match(toggle, /aria-describedby/);
  assert.match(toggle, /sr-only/);
  assert.match(hook, /displayEnabled/);
  assert.match(hook, /ONLINE_VIEWER_DISPLAY_DISABLED_REASON/);
  assert.doesNotMatch(
    toggle,
    /getOnlineViewerStatusHint[\s\S]*Enable this display before making it available online/,
  );
});

test("display cards always show Private or Public under online viewer toggle", () => {
  const toggle = read("src/components/displays/OnlineViewerToggle.tsx");
  assert.match(toggle, /getOnlineViewerVisibilityHint/);
  assert.match(toggle, /return onlineViewer\.visibility === "public" \? "Public" : "Private"/);
  assert.doesNotMatch(toggle, /if \(!displayEnabled\) \{\s*return undefined;/);
  for (const file of [
    "src/components/displays/DisplayCard.tsx",
    "src/components/displays/DeveloperHtmlDisplayCard.tsx",
    "src/components/displays/broad-arrow/BroadArrowTypedDisplayCard.tsx",
  ]) {
    const source = read(file);
    assert.match(source, /hint=\{getOnlineViewerVisibilityHint\(onlineViewer\)\}/, file);
  }
  const controls = read("src/components/displays/DisplayCardControls.tsx");
  assert.match(controls, /\{hint \? <p/);
});

test("view online requires local display enabled and online viewer enabled", () => {
  const button = read("src/components/displays/ViewOnlineButton.tsx");
  assert.match(button, /displayEnabled/);
  assert.match(button, /!displayEnabled/);
  assert.match(button, /Hosted portal URL is not configured/);
});

test("display cards pass local enabled state into online viewer controls", () => {
  for (const file of [
    "src/components/displays/DisplayCard.tsx",
    "src/components/displays/DeveloperHtmlDisplayCard.tsx",
    "src/components/displays/broad-arrow/BroadArrowTypedDisplayCard.tsx",
  ]) {
    const source = read(file);
    assert.match(source, /useOnlineViewerSettings\([\s\S]*enabled/, `${file} passes enabled to hook`);
    assert.match(source, /displayEnabled=\{enabled\}/, `${file} passes enabled to controls`);
  }
});

test("backend rejects enabling online viewer while local display is disabled", () => {
  const service = read("desktop/src/services/developer-tools-service.ts");
  assert.match(service, /nextEnabled && !display\.enabled/);
  assert.match(service, /Enable the display before turning on Online Viewer/);
});

test("cloud mapper keeps online viewer off in cloud when display is disabled", () => {
  const mapper = read("desktop/src/services/display-sync/cloud-display-mapper.ts");
  assert.match(
    mapper,
    /Boolean\(input\.code\?\.onlineViewerEnabled\) && input\.display\.enabled/,
  );
});

test("hosted RPC eligibility requires enabled display and pinned revision", () => {
  const migration = read("supabase/migrations/025_display_online_viewer_eligibility.sql");
  assert.match(migration, /and d\.enabled = true/);
  assert.match(migration, /online_published_revision_id is not null/);
  assert.match(migration, /display_revisions/);
});

test("enabling online viewer queues revision sync and immediate display sync", () => {
  const service = read("desktop/src/services/developer-tools-service.ts");
  const main = read("desktop/src/main.ts");
  assert.match(service, /display\.revision\.create/);
  assert.match(service, /syncNow\?\.\("online-viewer"\)/);
  assert.match(service, /syncNow\?\.\("display-enabled"\)/);
  assert.match(main, /syncNow: \(reason\)/);
});

test("display sync uploads base metadata before publication pointer", () => {
  const sync = read("desktop/src/services/display-sync/display-sync-service.ts");
  const baseIndex = sync.indexOf("pushDisplayBaseMetadata");
  const revisionIndex = sync.indexOf("pushPendingRevisions");
  const publishIndex = sync.indexOf("pushDisplayPublicationMetadata");
  assert.ok(baseIndex >= 0 && revisionIndex > baseIndex && publishIndex > revisionIndex);
});

test("cleanup script protects Broad Arrow and matches validation markers only", () => {
  const cleanup = read("scripts/live-validation/cleanup-validation-projects.mjs");
  const protectedRecords = read("scripts/live-validation/lib/access-management-protected-records.mjs");
  const classification = read("scripts/live-validation/lib/access-management-classification.mjs");
  assert.match(protectedRecords, /broad-arrow-auctions/);
  assert.match(cleanup, /isProtectedProject/);
  assert.match(cleanup, /isValidationProjectRecord/);
  assert.match(classification, /neud-validation-/);
  assert.match(cleanup, /--confirm-delete-validation-data/);
  assert.doesNotMatch(cleanup, /DELETE FROM projects WHERE slug NOT LIKE/);
});
