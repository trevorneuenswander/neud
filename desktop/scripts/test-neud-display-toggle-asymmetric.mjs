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

function setDisplayEnabledBlock() {
  const service = read("desktop/src/services/developer-tools-service.ts");
  return service.slice(
    service.indexOf("setDisplayEnabled("),
    service.indexOf("reconcileInvalidDisplayOnlineStates(") + 1200,
  );
}

test("enabling display does not enable Online Viewer", () => {
  const block = setDisplayEnabledBlock();
  const enabledMatch = block.match(/if \(enabled\) \{[\s\S]*?\n      \} else \{/);
  assert.ok(enabledMatch, "expected enabled branch in setDisplayEnabled");
  assert.match(enabledMatch[0], /display\.enabled/);
  assert.doesNotMatch(enabledMatch[0], /onlineViewerEnabled/);
  assert.doesNotMatch(enabledMatch[0], /reconcileProjectPublishing/);
});

test("disabling display disables Online Viewer and reconciles publishing", () => {
  const block = setDisplayEnabledBlock();
  assert.match(block, /onlineViewerEnabled: false/);
  assert.match(block, /display\.disabled/);
  assert.match(block, /display\.online_viewer_disabled/);
  assert.match(block, /reconcileProjectPublishing/);
  assert.match(block, /syncNow\?\.\("display-enabled"\)/);
});

test("Online Viewer cannot be enabled while display is disabled", () => {
  const service = read("desktop/src/services/developer-tools-service.ts");
  const toggle = read("src/components/displays/OnlineViewerToggle.tsx");
  assert.match(service, /Enable the display before turning on Online Viewer/);
  assert.match(toggle, /!displayEnabled/);
});

test("turning Online Viewer off does not disable display", () => {
  const service = read("desktop/src/services/developer-tools-service.ts");
  const block = service.slice(
    service.indexOf("updateOnlineViewerSettings("),
    service.indexOf("updateOnlineViewerSettings(") + 2800,
  );
  assert.match(block, /display\.online_viewer_disabled/);
  assert.doesNotMatch(block, /setEnabled\(display\.id, false\)/);
  assert.doesNotMatch(block, /displays\.setEnabled/);
});

test("invalid off/on local state is reconciled on startup", () => {
  const service = read("desktop/src/services/developer-tools-service.ts");
  const main = read("desktop/src/main.ts");
  assert.match(service, /reconcileInvalidDisplayOnlineStates/);
  assert.match(service, /display\.enabled\)/);
  assert.match(service, /code\?\.onlineViewerEnabled/);
  assert.match(main, /reconcileInvalidDisplayOnlineStates/);
});

test("disabling syncs effective online viewer off to cloud mapper", () => {
  const mapper = read("desktop/src/services/display-sync/cloud-display-mapper.ts");
  assert.match(
    mapper,
    /Boolean\(input\.code\?\.onlineViewerEnabled\) && input\.display\.enabled/,
  );
});

test("hosted actions unavailable when online viewer is off", () => {
  const card = read("src/components/hosted/HostedDisplayCard.tsx");
  assert.match(card, /disabled=\{!cardState\.canUseOnlineViewer\}/);
  assert.match(
    card,
    /Enable the display and turn on Online Viewer in the desktop app to use it online/,
  );
  assert.doesNotMatch(card, /"Disabled"/);
  assert.doesNotMatch(card, /"Not Published"/);
});

test("re-enabling display leaves Online Viewer off in enable path", () => {
  const block = setDisplayEnabledBlock();
  const enabledMatch = block.match(/if \(enabled\) \{[\s\S]*?\n      \} else \{/);
  assert.ok(enabledMatch);
  assert.doesNotMatch(enabledMatch[0], /onlineViewerEnabled: true/);
});

test("display.enabled is allowlisted for activity sync", () => {
  const migration = read("supabase/migrations/049_display_enabled_activity_events.sql");
  assert.match(migration, /'display\.enabled'/);
});

test("display.disabled is allowlisted for activity sync", () => {
  const migration = read("supabase/migrations/049_display_enabled_activity_events.sql");
  assert.match(migration, /'display\.disabled'/);
});

test("display.online_viewer_enabled is allowlisted for activity sync", () => {
  const migration = read("supabase/migrations/049_display_enabled_activity_events.sql");
  assert.match(migration, /'display\.online_viewer_enabled'/);
});

test("display.online_viewer_disabled is allowlisted for activity sync", () => {
  const migration = read("supabase/migrations/049_display_enabled_activity_events.sql");
  assert.match(migration, /'display\.online_viewer_disabled'/);
});

test("activity actor resolves user-initiated display events", () => {
  const actorResolution = read("src/lib/activity/actor-resolution.ts");
  const localData = read("desktop/src/services/local-data-service.ts");
  assert.match(localData, /shouldAutoResolveActivityActor/);
  assert.match(actorResolution, /resolveActivityActorLabel/);
});

test("activity sync captures rejected event type from RPC response", () => {
  const client = read("desktop/src/services/activity-sync/cloud-activity-client.ts");
  assert.match(client, /event_type/);
  assert.match(client, /rejectedEventType/);
});

test("activity failure does not roll back display disable path via record order", () => {
  const block = setDisplayEnabledBlock();
  const onlineDisableIndex = block.indexOf("onlineViewerEnabled: false");
  const activityIndex = block.indexOf("recordProjectActivity");
  assert.ok(onlineDisableIndex >= 0 && activityIndex > onlineDisableIndex);
});

test("disable emits display.disabled before online_viewer_disabled without duplicate UI events", () => {
  const block = setDisplayEnabledBlock();
  const disabledIndex = block.indexOf("display.disabled");
  const onlineDisabledIndex = block.indexOf("display.online_viewer_disabled");
  assert.ok(disabledIndex >= 0 && onlineDisabledIndex > disabledIndex);
  assert.match(block, /if \(onlineViewerWasDisabled\)/);
});

test("publisher reconciles when last online display is disabled", () => {
  const block = setDisplayEnabledBlock();
  assert.match(block, /reconcileProjectPublishing/);
  const localData = read("desktop/src/services/local-data-service.ts");
  assert.match(localData, /reconcileProjectPublishingForOnlineViewer/);
});

test("diagnose broad arrow online reports invalid state and activity rejection fields", () => {
  const script = read("scripts/live-validation/diagnose-broad-arrow-online.mjs");
  assert.match(script, /invalidStateDetected/);
  assert.match(script, /migration049Applied/);
  assert.match(script, /rejectedActivityEventType/);
  assert.match(script, /firstFailureStage/);
  assert.match(script, /activity_event_rejected/);
});
