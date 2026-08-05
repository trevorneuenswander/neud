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

test("packaged runtime never auto-establishes local desktop session", () => {
  const bootstrap = read("desktop/src/services/local-auth-bootstrap-service.ts");
  assert.match(bootstrap, /isPackagedDesktopRuntime\(\)/);
  assert.match(bootstrap, /shouldAutoEstablishLocalDesktopSession/);
  assert.match(bootstrap, /NEUD_ALLOW_LOCAL_DESKTOP_AUTH/);
  assert.match(bootstrap, /Packaged startup without authenticated session/);
});

test("main process purges synthetic local-desktop auth before bootstrap", () => {
  const main = read("desktop/src/main.ts");
  assert.match(main, /purgeSyntheticLocalDesktopSessionIfPresent/);
  assert.match(main, /localAuthBootstrap\.ensure\(\)/);
});

test("auth license manager rejects synthetic local-desktop sessions when packaged", () => {
  const auth = read("desktop/src/services/auth-license-manager.ts");
  assert.match(auth, /isSyntheticLocalDesktopAuthRecord/);
  assert.match(auth, /entitlement\?\.source === "local-desktop"/);
  assert.match(auth, /isPackagedDesktopRuntime\(\)/);
  assert.match(auth, /purgeSyntheticLocalDesktopSessionIfPresent/);
});

test("development local-desktop auth requires explicit opt-in flag", () => {
  const env = read("desktop/src/env/neud-env.ts");
  assert.match(env, /NEUD_ALLOW_LOCAL_DESKTOP_AUTH/);
});

test("startup path is cleared when auth is not allowed", () => {
  const main = read("desktop/src/main.ts");
  assert.match(main, /if \(savedPath && !authAllowed\)/);
  assert.match(main, /clearSavedStartupPath/);
});
