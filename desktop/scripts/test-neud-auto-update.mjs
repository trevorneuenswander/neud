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
