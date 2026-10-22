/**
 * NEUD v0.3.0 — Video display stabilization (source + wiring assertions).
 * Does not claim hardware/manual freeze validation.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktopRoot = path.join(root, "desktop");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("subscription hub no longer sends user-visible Subscribed status", () => {
  const hub = read("desktop/src/media/video/video-frame-hub.ts");
  assert.doesNotMatch(hub, /message:\s*"Subscribed"/);
  assert.match(hub, /type:\s*"session"/);
});

test("video player HTML does not overlay routine connection status on graphics", () => {
  const player = read("desktop/src/media/video/video-player-html.ts");
  assert.doesNotMatch(player, /showStatus\(\s*["']Video connected["']/);
  assert.doesNotMatch(player, /showStatus\(\s*["']Video reconnecting/);
  assert.doesNotMatch(player, /showError\(\s*["']Video connected["']/);
  assert.doesNotMatch(player, /showStatus\(/);
  assert.doesNotMatch(player, /msg\.type === "status"/);
  assert.match(player, /function showError/);
  assert.match(player, /type: "subscribe"/);
  assert.match(player, /Video socket unavailable/);
  assert.match(player, /Video socket error/);
  assert.match(player, /\[neud-video\] frame socket open/);
  assert.match(player, /socket\.onopen/);
});

test("video settings page omits playback controls", () => {
  const edit = read("src/components/displays/DisplayEditClient.tsx");
  assert.doesNotMatch(edit, /VideoPlaybackControls/);
  assert.match(edit, /Use Play, Pause, Restart, Stop, and Loop on the Displays page card/);
  assert.match(edit, /ProRes Video/);
});

test("display card keeps playback controls with filled solid icons", () => {
  const card = read("src/components/displays/DeveloperHtmlDisplayCard.tsx");
  assert.match(card, /VideoPlaybackControls/);
  assert.match(card, /variant="card"/);
  assert.match(card, /DisplayEditMenu[\s\S]*VideoPlaybackControls/s);

  const controls = read("src/components/displays/VideoPlaybackControls.tsx");
  assert.match(controls, /function PlayIcon/);
  assert.match(controls, /function PauseIcon/);
  assert.match(controls, /function StopIcon/);
  assert.match(controls, /fill="currentColor"/);
  assert.match(controls, /RotateCcw/);
  assert.match(controls, /Repeat/);
  assert.match(controls, /aria-label="Play"/);
  assert.match(controls, /aria-label="Pause"/);
  assert.match(controls, /aria-label="Stop"/);
  assert.match(controls, /aria-pressed=\{loopOn\}/);
  assert.match(controls, /h-\[18px\] w-\[18px\]/);
});

test("video cards hide indefinite Connecting text but preserve status line height", () => {
  const card = read("src/components/displays/DeveloperHtmlDisplayCard.tsx");
  assert.match(card, /min-h-\[1rem\]/);
  assert.match(card, /sourceType === "project-video"/);
  assert.match(card, /Connection Error/);
  assert.match(card, /omit HTML data-bridge/);
  assert.doesNotMatch(
    card,
    /project-video[\s\S]{0,200}return "Connecting…"/,
  );
});

test("video description defaults and card uses persisted description", () => {
  const tools = read("desktop/src/services/developer-tools-service.ts");
  assert.match(tools, /DEFAULT_VIDEO_DISPLAY_DESCRIPTION = "ProRes 4444 Video Display"/);
  assert.match(tools, /repairEmptyVideoDisplayDescriptions/);
  assert.match(
    tools,
    /input\.description\?\.trim\(\) \|\| DEFAULT_VIDEO_DISPLAY_DESCRIPTION/,
  );

  const card = read("src/components/displays/DeveloperHtmlDisplayCard.tsx");
  assert.match(
    card,
    /display\.description\?\.trim\(\) \|\| "ProRes 4444 Video Display"/,
  );
  assert.doesNotMatch(
    card,
    /sourceType === "project-video"\s*\?\s*"ProRes 4444 Video Display"/,
  );

  const form = read("src/components/developer-tools/UploadVideoDisplayForm.tsx");
  assert.match(form, /defaultDescription = "ProRes 4444 Video Display"/);
  assert.match(form, /useState\(defaultDescription\)/);
});

test("deleted video displays: tombstone list filter, purge, suppress orphan recovery", () => {
  const tools = read("desktop/src/services/developer-tools-service.ts");
  assert.match(tools, /purgeTombstonedDisplays/);
  assert.match(tools, /suppressOrphanRecovery/);
  assert.match(tools, /alreadyDeleted/);
  assert.doesNotMatch(
    tools,
    /if \(this\.displaySyncHooks\.isDeleted\?\.\(displayId\)\) \{\s*throw new Error\("Display has already been deleted\."\)/,
  );

  const store = read("desktop/src/media/video-media-store.ts");
  assert.match(store, /orphan_recovery_suppressed/);
  assert.match(store, /suppressOrphanRecovery/);

  const migration = read(
    "desktop/src/database/migrations/046_video_media_orphan_recovery.sql",
  );
  assert.match(migration, /orphan_recovery_suppressed/);

  const pull = read("desktop/src/services/display-sync/display-sync-pull.ts");
  assert.match(pull, /isDeleted\?/);
  assert.match(pull, /pull\.skip_tombstoned/);

  const sync = read("desktop/src/services/display-sync/display-sync-service.ts");
  assert.match(sync, /isDeleted: \(displayId\) => this\.tombstones\.isDeleted/);
});

test("native stop avoids recursive mutex and BlockingCall deadlock patterns", () => {
  const mac = read("desktop/native/video/video-decoder-mac.mm");
  assert.match(mac, /decodeFirstFrameIntoLocked/);
  assert.match(mac, /emitStateUnlocked/);
  assert.match(mac, /cv_\.wait_for/);
  assert.match(mac, /\[neud_video\] stop: request received/);
  assert.match(mac, /joinWorker\(\)/);
  // stop must not call decodeFirstFrameLocked while holding lock then publishFrame locking again
  assert.match(mac, /haveFrame = decodeFirstFrameIntoLocked/);

  const addon = read("desktop/native/video/video-addon.cc");
  assert.match(addon, /NonBlockingCall/);
  assert.doesNotMatch(addon, /frameTsfn\.BlockingCall/);
  assert.doesNotMatch(addon, /stateTsfn\.BlockingCall/);

  const service = read("desktop/src/media/video/video-playback-service.ts");
  assert.match(service, /\[video-playback\] stop: request/);
  assert.match(service, /\[video-playback\] stop: complete/);
});

test("existing UI correction tests still expect card playback placement", () => {
  const card = read("src/components/displays/DeveloperHtmlDisplayCard.tsx");
  assert.match(card, /DisplayEditMenu[\s\S]*VideoPlaybackControls/s);
});
