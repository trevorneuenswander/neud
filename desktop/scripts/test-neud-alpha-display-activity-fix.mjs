#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("migration 048 resolves actor_display_name from profiles", () => {
  const migration = read("supabase/migrations/048_activity_actor_resolution.sql");
  assert.match(migration, /resolve_activity_actor_display_name/);
  assert.match(migration, /activity_events_set_actor_display_name/);
});

test("migration 049 allows local display enabled/disabled activity events", () => {
  const migration = read("supabase/migrations/049_display_enabled_activity_events.sql");
  assert.match(migration, /display\.enabled/);
  assert.match(migration, /display\.disabled/);
});

test("hosted activity query selects user_id and resolves profile names", () => {
  const queries = read("src/lib/hosted/activity-queries.ts");
  assert.match(queries, /user_id/);
  assert.match(queries, /resolveActivityActorLabel/);
  assert.match(queries, /profiles/);
  assert.match(queries, /display\.enabled/);
  assert.match(queries, /display\.online_viewer_enabled/);
});

test("shared actor resolution keeps System only for automated events", () => {
  const actorResolution = read("src/lib/activity/actor-resolution.ts");
  assert.match(actorResolution, /ACTIVITY_UNKNOWN_USER_LABEL/);
  assert.match(actorResolution, /isAutomatedActivityEventType/);
  assert.match(actorResolution, /display\.online_published/);
  assert.match(actorResolution, /resolveActivityDisplayActorLabel/);
  assert.match(actorResolution, /shouldTreatActivityAsSystem/);
});

test("desktop recordActivity excludes automated online publish pipeline events from actor auto-resolve", () => {
  const localData = read("desktop/src/services/local-data-service.ts");
  assert.match(localData, /shouldAutoResolveActivityActor/);
  assert.match(localData, /isAutomatedActivityEventType/);
  assert.match(localData, /type\.startsWith\("display\."\)/);
});

test("activity UI uses shared actor display resolver", () => {
  for (const relativePath of [
    "src/components/activity/ActivityTable.tsx",
    "src/components/activity/CompactActivityTable.tsx",
    "src/components/activity/ActivityFullView.tsx",
    "src/components/hosted/HostedActivityFullView.tsx",
  ]) {
    const source = read(relativePath);
    assert.match(source, /resolveActivityDisplayActorLabel/);
    assert.doesNotMatch(source, /event\.actorName \|\| ACTIVITY_SYSTEM_ACTOR_LABEL/);
  }
});

test("cloud activity mapper does not force System when user_id exists", () => {
  const mapper = read("desktop/src/services/activity-sync/cloud-activity-mapper.ts");
  assert.match(mapper, /resolveActivityActorLabel/);
  assert.doesNotMatch(mapper, /actor_display_name \?\? "System"/);
});

test("setDisplayEnabled disables online viewer when turning display off", () => {
  const service = read("desktop/src/services/developer-tools-service.ts");
  const block = service.slice(
    service.indexOf("setDisplayEnabled("),
    service.indexOf("reconcileInvalidDisplayOnlineStates("),
  );
  assert.match(block, /this\.displays\.setEnabled/);
  assert.match(block, /onlineViewerEnabled: false/);
  assert.match(block, /display\.disabled/);
  assert.match(block, /display\.online_viewer_disabled/);
  assert.match(block, /reconcileProjectPublishing/);
  const enableSectionMatch = block.match(/if \(enabled\) \{[\s\S]*?\n      \} else \{/);
  assert.ok(enableSectionMatch);
  assert.doesNotMatch(enableSectionMatch[0], /onlineViewerEnabled: true/);
});

test("setDisplayEnabled enabling remains local-only", () => {
  const service = read("desktop/src/services/developer-tools-service.ts");
  const block = service.slice(
    service.indexOf("setDisplayEnabled("),
    service.indexOf("reconcileInvalidDisplayOnlineStates("),
  );
  const enabledMatch = block.match(/if \(enabled\) \{[\s\S]*?\n      \} else \{/);
  assert.ok(enabledMatch);
  assert.match(enabledMatch[0], /display\.enabled/);
  assert.doesNotMatch(enabledMatch[0], /reconcileProjectPublishing/);
  assert.match(block, /if \(!enabled\) \{[\s\S]*reconcileProjectPublishing/);
});

test("updateOnlineViewerSettings keeps sync and separate activity events", () => {
  const service = read("desktop/src/services/developer-tools-service.ts");
  const block = service.slice(
    service.indexOf("updateOnlineViewerSettings("),
    service.indexOf("updateOnlineViewerSettings(") + 3200,
  );
  assert.match(block, /display\.online_viewer_enabled/);
  assert.match(block, /display\.online_viewer_disabled/);
  assert.match(block, /Online Viewer enabled/);
  assert.match(block, /Online Viewer disabled/);
  assert.match(block, /display\.revision\.create/);
  assert.match(block, /reconcileProjectPublishing/);
  assert.match(block, /syncNow\?\.\("online-viewer"\)/);
});

test("hosted display card shows only online viewer and visibility pills", () => {
  const card = read("src/components/hosted/HostedDisplayCard.tsx");
  assert.match(card, /Online Viewer:/);
  assert.match(card, /Public/);
  assert.match(card, /Private/);
  assert.doesNotMatch(card, /"Disabled"/);
  assert.doesNotMatch(card, /"Not Published"/);
  assert.doesNotMatch(card, /\{display\.enabled \? "Enabled"/);
  assert.match(card, /display\.online_viewer_enabled/);
});

test("desktop display cards restore separate online viewer toggle", () => {
  for (const relativePath of [
    "src/components/displays/DisplayCard.tsx",
    "src/components/displays/DeveloperHtmlDisplayCard.tsx",
    "src/components/displays/broad-arrow/BroadArrowTypedDisplayCard.tsx",
  ]) {
    const source = read(relativePath);
    assert.match(source, /OnlineViewerToggle/);
    assert.match(source, /getOnlineViewerStatusHint/);
    assert.match(source, /label="Enable Display"/);
    assert.match(source, /label="Online Viewer"/);
  }
});

test("diagnose activity actor resolution script is registered", () => {
  const pkg = read("package.json");
  assert.match(pkg, /diagnose:activity-actor-resolution/);
  assert.ok(fs.existsSync(path.join(root, "scripts/live-validation/diagnose-activity-actor-resolution.mjs")));
});

test("diagnose broad arrow online reports display state failure stage", () => {
  const script = read("scripts/live-validation/diagnose-broad-arrow-online.mjs");
  assert.match(script, /firstFailureStage/);
  assert.match(script, /onlineViewerMismatch/);
  assert.match(script, /migration049Applied/);
});

test("portal card disables actions when online viewer is off", () => {
  const card = read("src/components/hosted/HostedDisplayCard.tsx");
  assert.match(
    card,
    /Enable the display and turn on Online Viewer in the desktop app to use it online/,
  );
  assert.match(card, /disabled=\{!cardState\.canUseOnlineViewer\}/);
});

test("cloud mapper keeps effective online viewer off when display disabled", () => {
  const mapper = read("desktop/src/services/display-sync/cloud-display-mapper.ts");
  assert.match(
    mapper,
    /Boolean\(input\.code\?\.onlineViewerEnabled\) && input\.display\.enabled/,
  );
});
