#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktopRoot = path.join(repoRoot, "desktop");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("auto-update service is packaged-only and uses electron-updater", () => {
  const source = read("desktop/src/services/auto-update-service.ts");
  assert.match(source, /from "electron-updater"/);
  assert.match(source, /app\.isPackaged/);
  assert.match(source, /autoInstallOnAppQuit = false/);
  assert.match(source, /NEUD_DESKTOP_DEV/);
});

test("update IPC channels are registered through neud namespace", () => {
  const ipc = read("desktop/src/ipc/updates.ts");
  const preload = read("desktop/src/preload.ts");
  assert.match(ipc, /neud:updates:getStatus/);
  assert.match(ipc, /neud:updates:check/);
  assert.match(ipc, /neud:updates:install/);
  assert.match(preload, /neud:updates:getStatus/);
  assert.match(preload, /neud:updates:check/);
  assert.match(preload, /neud:updates:install/);
  assert.match(preload, /neud:updates:status/);
});

test("Help menu and Settings page share the centralized updater service", () => {
  const menu = read("desktop/src/menu/application-menu.ts");
  const main = read("desktop/src/main.ts");
  const settings = read("src/components/settings/ApplicationUpdatesSection.tsx");

  assert.match(menu, /Check for Updates/);
  assert.match(menu, /triggerHelpMenuCheckForUpdates/);
  assert.match(main, /initializeAutoUpdateService/);
  assert.match(main, /setHelpMenuCheckForUpdatesHandler/);
  assert.match(main, /registerUpdateIpc/);
  assert.match(settings, /Check for Updates/);
  assert.match(settings, /api\.updates\.check\("manual"\)/);
  assert.match(settings, /Restart and Install/);
  assert.match(settings, /sign you out/);
});

test("electron-builder publishes draft GitHub releases without embedding tokens", () => {
  const config = read("desktop/electron-builder.yml");
  assert.match(config, /provider: github/);
  assert.match(config, /releaseType: draft/);
  assert.doesNotMatch(config, /token:/i);
  assert.doesNotMatch(config, /GH_TOKEN/);
});

test("desktop package includes electron-updater dependency", () => {
  const desktopPkg = JSON.parse(read("desktop/package.json"));
  assert.equal(typeof desktopPkg.dependencies["electron-updater"], "string");
});

test("packaging injects app-update.yml before NSIS prepackaged step", () => {
  const desktopPkg = JSON.parse(read("desktop/package.json"));
  assert.match(desktopPkg.scripts["package:win"], /ensure-packaged-app-update-config\.mjs/);
  assert.match(desktopPkg.scripts["package:win"], /verify-packaged-auto-update-config\.mjs/);
  assert.match(desktopPkg.scripts["package:win"], /--prepackaged release\/win-unpacked/);
  const ensureIndex = desktopPkg.scripts["package:win"].indexOf("ensure-packaged-app-update-config");
  const nsisIndex = desktopPkg.scripts["package:win"].indexOf("--prepackaged");
  assert.ok(ensureIndex >= 0 && ensureIndex < nsisIndex);
});

test("ensure script writes github provider metadata without tokens", () => {
  const ensure = read("desktop/scripts/ensure-packaged-app-update-config.mjs");
  const lib = read("desktop/scripts/lib/electron-builder-publish-config.mjs");
  const builder = read("desktop/electron-builder.yml");
  assert.match(builder, /owner: trevorneuenswander/);
  assert.match(builder, /repo: neud/);
  assert.match(builder, /provider: github/);
  assert.match(lib, /updaterCacheDirName/);
  assert.match(lib, /FORBIDDEN_KEY_PATTERN/);
  assert.doesNotMatch(builder, /token:/i);
  assert.match(ensure, /app-update\.yml/);
});

test("auto-update service reports friendly missing-config errors", () => {
  const updater = read("desktop/src/services/auto-update-service.ts");
  const config = read("desktop/src/services/packaged-update-config.ts");
  assert.match(config, /app-update\.yml/);
  assert.match(config, /Update configuration is missing from this installation\./);
  assert.match(updater, /assertPackagedUpdateConfigAvailable/);
  assert.match(updater, /formatMissingUpdateConfigMessage/);
  assert.match(updater, /logPackagedUpdateConfigDiagnostics/);
  assert.match(updater, /ENOENT/);
});

test("auto-update service disables autoDownload and schedules one startup check", () => {
  const updater = read("desktop/src/services/auto-update-service.ts");
  assert.match(updater, /autoUpdater\.autoDownload = false/);
  assert.match(updater, /startupCheckPerformed/);
  assert.match(updater, /scheduleStartupUpdateCheck\(delayMs = 3_000\)/);
  assert.match(updater, /startup-check\.scheduled/);
  assert.match(updater, /startup-check\.begin/);
  assert.match(updater, /startup-check\.up-to-date/);
  assert.match(updater, /startup-check\.available/);
  assert.match(updater, /startup-check\.failed/);
  assert.match(updater, /downloadAvailableUpdate/);
  assert.match(updater, /dismissUpdatePrompt/);
  assert.match(updater, /promptVisible/);
});

test("update IPC exposes download and dismiss actions", () => {
  const ipc = read("desktop/src/ipc/updates.ts");
  const preload = read("desktop/src/preload.ts");
  assert.match(ipc, /neud:updates:download/);
  assert.match(ipc, /neud:updates:dismiss/);
  assert.match(preload, /neud:updates:download/);
  assert.match(preload, /neud:updates:dismiss/);
});

test("shared update modal is mounted in desktop shell", () => {
  const shell = read("src/components/portal/DesktopAppShell.tsx");
  const modal = read("src/components/settings/UpdateAvailableModal.tsx");
  assert.match(shell, /UpdateAvailableModalHost/);
  assert.match(modal, /Download Update/);
  assert.match(modal, /Restart and Install/);
  assert.match(modal, /sign you out/);
  assert.match(modal, /normalizeReleaseNotes/);
});

test("release notes are normalized without rendering raw HTML", () => {
  const notes = read("src/lib/desktop/normalize-release-notes.ts");
  assert.match(notes, /replace\(\/<\[\^>\]\+>\/g/);
});

test("verify script gates packaged update metadata", () => {
  const verify = read("desktop/scripts/verify-packaged-auto-update-config.mjs");
  assert.match(verify, /app-update\.yml/);
  assert.match(verify, /latest\.yml/);
  assert.match(verify, /provider/);
  assert.match(verify, /owner/);
  assert.match(verify, /repo/);
  assert.match(verify, /must not embed credentials/);
});
