#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("sign out logs immediately and uses forceLocalSignOut", () => {
  const logoutButton = readSrc("src/components/auth/LogoutButton.tsx");
  const forceSignOut = readSrc("src/lib/auth/force-local-sign-out.ts");

  assert.match(logoutButton, /Sign Out clicked/);
  assert.match(logoutButton, /forceLocalSignOut/);
  assert.match(forceSignOut, /Sign Out clicked/);
  assert.match(forceSignOut, /Logout handler entered/);
  assert.match(forceSignOut, /forceSignOut/);
  assert.match(forceSignOut, /Redirecting to login/);
});

test("auth principal no longer treats local API session config as login", () => {
  const authServer = readSrc("src/lib/local/auth.server.ts");
  assert.doesNotMatch(authServer, /readLocalApiSessionConfig\(\)/);
  assert.match(authServer, /\/api\/auth\/session/);
});

test("redirectIfAuthenticated uses fast session principal only", () => {
  const session = readSrc("src/lib/auth/session.ts");
  assert.match(session, /resolveLocalAuthenticatedPrincipal/);
  assert.doesNotMatch(session, /resolveLocalProfile/);
});

test("main process exposes Help menu and Ctrl+Shift+L recovery", () => {
  const menu = readSrc("desktop/src/menu/application-menu.ts");
  const main = readSrc("desktop/src/main.ts");
  const ipc = readSrc("desktop/src/ipc/auth.ts");

  assert.match(menu, /Clear Local Session/);
  assert.match(menu, /CmdOrCtrl\+Shift\+L/);
  assert.match(main, /forceSignOutFromMain/);
  assert.match(main, /setClearLocalSessionHandler/);
  assert.match(ipc, /neud:auth:forceSignOut/);
});

test("next session cache can be reset after logout", () => {
  const route = readSrc("src/app/api/local/reset-session-cache/route.ts");
  const forceSignOut = readSrc("src/lib/auth/force-local-sign-out.ts");

  assert.match(route, /resetLocalApiSessionConfigCache/);
  assert.match(forceSignOut, /reset-session-cache/);
});

test("bootstrap skips auto local login after explicit sign out", () => {
  const bootstrap = readSrc("desktop/src/services/local-auth-bootstrap-service.ts");
  assert.match(bootstrap, /AUTH_EXPLICITLY_SIGNED_OUT_KEY/);
  assert.match(bootstrap, /explicitlySignedOut/);
});

test("sidebar exposes sign out in healthy state and recovery only on identity error", () => {
  const panel = readSrc("src/components/portal/SidebarUserPanel.tsx");
  const recovery = readSrc("src/components/auth/SessionRecoveryActions.tsx");
  const logout = readSrc("src/components/auth/LogoutButton.tsx");

  assert.match(panel, /LogoutButton/);
  assert.match(logout, /Sign Out/);
  assert.match(recovery, /Clear Local Session and Sign In Again/);
  assert.match(panel, /showClearLocalSession=\{meta\?\.identityStatus === "stale-session"\}/);
});

test("portal nav does not block on projects meta", () => {
  const navItems = readSrc("src/lib/portal/nav-items.server.ts");
  assert.doesNotMatch(navItems, /localGetProjectsMeta/);
});
