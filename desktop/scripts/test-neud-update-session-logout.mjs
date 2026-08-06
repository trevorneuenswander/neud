#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("install path writes pending update marker before quitAndInstall", () => {
  const updater = read("desktop/src/services/auto-update-service.ts");
  assert.match(updater, /writePendingInstalledUpdateMarker/);
  assert.match(updater, /quitAndInstall\(false, true\)/);
  assert.match(updater, /appendUpdateSessionLog/);
});

test("update checks and download failures do not write logout markers", () => {
  const updater = read("desktop/src/services/auto-update-service.ts");
  const installMatch = updater.match(
    /export function installDownloadedUpdate\([\s\S]*?\n\}/,
  );
  assert.ok(installMatch, "installDownloadedUpdate implementation missing");
  assert.match(installMatch[0], /writePendingInstalledUpdateMarker/);

  const checkMatch = updater.match(/export async function checkForUpdates\([\s\S]*?\n\}/);
  assert.ok(checkMatch, "checkForUpdates implementation missing");
  assert.doesNotMatch(checkMatch[0], /writePendingInstalledUpdateMarker/);
});

test("startup handler only logs out when installed version matches target marker", () => {
  const handler = read("desktop/src/services/update-session-handler.ts");
  assert.match(handler, /matchesTarget && versionChanged/);
  assert.match(handler, /consumePendingInstalledUpdateMarker/);
  assert.match(handler, /installed_version_unchanged/);
  assert.match(handler, /installation_did_not_occur_before_stale_timeout/);
});

test("marker is stored under userData updates directory", () => {
  const pending = read("desktop/src/services/pending-installed-update.ts");
  assert.match(pending, /pending-installed-update\.json/);
  assert.match(pending, /updates/);
  assert.match(pending, /logoutRequired: true/);
  assert.match(pending, /operationId/);
});

test("main process clears auth before cloud session restore after update", () => {
  const main = read("desktop/src/main.ts");
  assert.match(main, /evaluatePendingInstalledUpdateOnStartup/);
  assert.match(main, /clearAuthenticationForInstalledUpdate/);
  assert.match(main, /pendingInstalledUpdateEvaluation\.logoutRequired/);
  assert.match(main, /\/\?updated=1/);
});

test("canonical clear operation preserves non-auth application data scope", () => {
  const clearAuth = read("desktop/src/services/clear-authentication-for-installed-update.ts");
  assert.match(clearAuth, /authLicenseManager\.clear\(\)/);
  assert.match(clearAuth, /supabaseUserSessionService\.clearSession\(\)/);
  assert.match(clearAuth, /authenticatedCloud\.notifySessionCleared\(\)/);
  assert.match(clearAuth, /clearSessionBinding/);
  assert.match(clearAuth, /reset-session-cache/);
  assert.match(clearAuth, /clearStorageData/);
  assert.doesNotMatch(clearAuth, /rmSync\(paths\.root/);
  assert.doesNotMatch(clearAuth, /databaseFile/);
});

test("Restart and Install UI warns before signing the user out", () => {
  const settings = read("src/components/settings/ApplicationUpdatesSection.tsx");
  assert.match(
    settings,
    /NEUD will install the update and sign you out\. You will need to sign in again after the update\./,
  );
  assert.match(settings, /window\.confirm/);
});

test("login page can show post-update sign-in message without exposing marker details", () => {
  const notice = read("src/components/auth/PostUpdateSignInNotice.tsx");
  assert.match(notice, /NEUD was updated\. Please sign in again\./);
  assert.match(notice, /updated/);
  assert.doesNotMatch(notice, /operationId/);
  assert.doesNotMatch(notice, /pending-installed-update/);
});

test("update session diagnostics append to update-session.log", () => {
  const log = read("desktop/src/services/update-session-log.ts");
  assert.match(log, /update-session\.log/);
  assert.doesNotMatch(log, /accessToken/);
  assert.doesNotMatch(log, /refreshToken/);
});
