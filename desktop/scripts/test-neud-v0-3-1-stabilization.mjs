#!/usr/bin/env node
/**
 * Focused regression checks for Alpha v0.3.1 stabilization work (source-level).
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

test("v0.3.1 package version is 0.3.1 while public catalog current remains 0.3.0", () => {
  const root = JSON.parse(read("package.json"));
  const desktop = JSON.parse(read("desktop/package.json"));
  assert.equal(root.version, "0.3.1");
  assert.equal(desktop.version, "0.3.1");
  const catalog = read("src/lib/releases/neud-releases.ts");
  assert.match(catalog, /version: "0\.3\.0"/);
  assert.match(catalog, /current: true/);
  assert.doesNotMatch(catalog, /version: "0\.3\.1"/);
});

test("color refresh keeps semantic success/warning/danger and documents rollback", () => {
  const css = read("src/app/globals.css");
  assert.match(css, /--primary:\s*#2f6bff/);
  assert.match(css, /--accent:\s*#8b7cff/);
  assert.match(css, /--success:\s*#22c55e/);
  assert.match(css, /--warning:\s*#f59e0b/);
  assert.match(css, /--danger:\s*#ef4444/);
  assert.ok(fs.existsSync(path.join(repoRoot, "docs/themes/v0.3.0-palette-baseline.md")));
  assert.ok(fs.existsSync(path.join(repoRoot, "docs/themes/v0.3.1-color-refresh.md")));
});

test("splash embeds official icon and refreshed navy/blue colors", () => {
  const splash = read("desktop/src/app/splash-window.ts");
  assert.match(splash, /resolveSplashIconDataUri/);
  assert.match(splash, /assets\/icon\.png/);
  assert.match(splash, /#070a12|#2f6bff|#1a2450/);
});

test("video card controls keep errors out of the action/size row", () => {
  const controls = read("src/components/displays/VideoPlaybackControls.tsx");
  assert.match(controls, /VideoPlaybackStatusLine/);
  assert.match(controls, /Card: controls only/);
  const card = read("src/components/displays/DeveloperHtmlDisplayCard.tsx");
  assert.match(card, /VideoPlaybackStatusLine/);
});

test("output catalog filters to fully installed local projects", () => {
  const ipc = read("desktop/src/ipc/output.ts");
  assert.match(ipc, /scope: "installed"/);
  assert.match(ipc, /isPackageInstalled === true/);
});

test("Windows recording is H.264-only in UI and backend guards", () => {
  const ui = read("src/components/output/OutputManager.tsx");
  assert.match(ui, /recordingFormatOptionsForPlatform/);
  assert.match(ui, /h264-mp4/);
  const model = read("desktop/src/output/disk-recording-model.ts");
  assert.match(model, /defaultDiskRecordingFormatForPlatform/);
  assert.match(model, /isDiskRecordingFormatSupportedOnPlatform/);
  assert.match(model, /buildPartialRecordingPath/);
  const service = read("desktop/src/output/disk-recording-service.ts");
  assert.match(service, /Windows Record to Disk supports H\.264 MP4 only/);
  assert.match(service, /buildPartialRecordingPath/);
  const recorder = read("desktop/native/recorder/recorder-win.cpp");
  assert.match(recorder, /Media Foundation/);
  assert.match(recorder, /IMFSinkWriter/);
  assert.match(recorder, /MF_TRANSCODE_CONTAINERTYPE/);
  assert.match(recorder, /MfFailure/);
  assert.match(recorder, /PathLooksLikeMp4/);
});

test("Windows FFmpeg decoder and packaging hooks exist", () => {
  assert.ok(fs.existsSync(path.join(repoRoot, "desktop/native/video/video-decoder-win-ffmpeg.cpp")));
  const gyp = read("desktop/native/video/binding.gyp");
  assert.match(gyp, /neud_with_ffmpeg/);
  assert.match(gyp, /video-decoder-win-ffmpeg\.cpp/);
  assert.ok(fs.existsSync(path.join(repoRoot, "desktop/scripts/package-windows-ffmpeg-lgpl.mjs")));
  assert.ok(fs.existsSync(path.join(repoRoot, "desktop/scripts/fetch-windows-ffmpeg-lgpl.mjs")));
  const lock = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "desktop/vendor/ffmpeg-windows-lgpl.lock.json"), "utf8"),
  );
  assert.match(String(lock.artifact), /lgpl-shared/i);
  assert.ok(lock.sha256 && lock.sha256.length === 64);
  const pkgWin = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  assert.match(pkgWin.scripts["package:win"], /NEUD_WITH_FFMPEG=1/);
  assert.match(pkgWin.scripts["package:win"], /fetch-windows-ffmpeg-lgpl/);
});

test("migration 046 orphan_recovery_suppressed is registered", () => {
  const migrate = read("desktop/src/database/migrate.ts");
  assert.match(migrate, /046_video_media_orphan_recovery\.sql/);
  const sql = read("desktop/src/database/migrations/046_video_media_orphan_recovery.sql");
  assert.match(sql, /orphan_recovery_suppressed/);
});

test("DeckLink stub is reported distinctly from missing Desktop Video", () => {
  const model = read("desktop/src/output/decklink-model.ts");
  assert.match(model, /EXTERNAL_DEVICE_STUB_BUILD/);
  const port = read("desktop/src/output/native-decklink-port.ts");
  assert.match(port, /EXTERNAL_DEVICE_STUB_BUILD/);
  assert.match(port, /stub build/);
});

test("activity sync queues follow-up when a sync is already in progress", () => {
  const sync = read("desktop/src/services/activity-sync/activity-sync-service.ts");
  assert.match(sync, /scheduleFollowUpSync/);
  assert.doesNotMatch(
    sync,
    /if \(reason === "startup" \|\| reason === "startup-restore" \|\| reason === "login"\) \{\s*return;/,
  );
});

test("slogan is Graphics Without Limits.", () => {
  assert.match(read("src/lib/branding/app-name.ts"), /Graphics Without Limits\./);
  assert.match(read("README.md"), /Graphics Without Limits\./);
  assert.doesNotMatch(read("src/lib/branding/app-name.ts"), /Ultimate Data Stripper/);
});

test("Windows release packaging refuses DeckLink stubs", () => {
  const build = read("desktop/scripts/build-decklink-addon.mjs");
  assert.match(build, /NEUD_REQUIRE_REAL_DECKLINK/);
  assert.match(build, /requireRealDeckLinkAddon/);
  assert.match(build, /ensureWindowsDeckLinkHeaders/);
  const rootPkg = JSON.parse(read("package.json"));
  assert.match(rootPkg.scripts["package:win"], /NEUD_REQUIRE_REAL_DECKLINK=1/);
  assert.match(rootPkg.scripts["package:win"], /run-with-env\.mjs/);
  const desktopPkg = JSON.parse(read("desktop/package.json"));
  assert.match(desktopPkg.scripts["package:win"], /verify-packaged-decklink-addon\.mjs --packaged/);
  assert.match(desktopPkg.scripts["package:win"], /verify-decklink-addon-load\.mjs --packaged/);
  assert.match(desktopPkg.scripts["package:win"], /verify-packaged-no-decklink-sdk\.mjs/);
  assert.match(desktopPkg.scripts["package:win"], /verify-windows-native-release-gates\.mjs/);
  assert.ok(fs.existsSync(path.join(repoRoot, "desktop/scripts/verify-packaged-decklink-addon.mjs")));
  assert.ok(fs.existsSync(path.join(repoRoot, "docs/output-engine/decklink-windows-release.md")));
  const workflow = read(".github/workflows/release-windows.yml");
  assert.match(workflow, /NEUD_REQUIRE_REAL_DECKLINK: "1"/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /google-github-actions\/auth@v2|setup-decklink-sdk-windows/);
  assert.match(workflow, /NEUD_GCP_BUILD_SERVICE_ACCOUNT/);
  assert.match(workflow, /1iYubcuA0WzlsLG6jilF2nR7_hC2sx-8A/);
  assert.doesNotMatch(workflow, /NEUD_DECKLINK_SDK_ARCHIVE/);
  assert.ok(fs.existsSync(path.join(repoRoot, ".github/actions/setup-decklink-sdk-windows/action.yml")));
  assert.ok(fs.existsSync(path.join(repoRoot, "desktop/native/decklink/decklink-dispatch-win.cpp")));
});
