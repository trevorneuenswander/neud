import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CredentialStore } from "../dist/services/credential-store.js";
import { hasPersistedSessionCookies } from "../dist/services/engine-session-auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const engineId = "a611842e-303e-4663-8fc8-2c44599aaebc";

test("hasPersistedSessionCookies detects migrated NEUD cookie files", () => {
  const neudRoot = path.join(os.homedir(), "AppData", "Roaming", "NEUD");
  if (!fs.existsSync(neudRoot)) {
    return;
  }

  const paths = {
    root: neudRoot,
    cookies: path.join(neudRoot, "cookies"),
    credentialsDir: path.join(neudRoot, "config", "credentials"),
  };

  const hasCookies = hasPersistedSessionCookies(paths, engineId);
  if (fs.existsSync(path.join(paths.cookies, `${engineId}.json`))) {
    assert.equal(hasCookies, true);
  }
});

test("hasRunnableAuth is true when persisted session cookies exist", async (t) => {
  let electronAvailable = false;
  try {
    const electron = await import("electron");
    electronAvailable = electron.safeStorage?.isEncryptionAvailable?.() === true;
  } catch {
    electronAvailable = false;
  }

  if (!electronAvailable) {
    t.skip("Electron secure storage is unavailable in this test runtime.");
    return;
  }

  const neudRoot = path.join(os.homedir(), "AppData", "Roaming", "NEUD");
  if (!fs.existsSync(neudRoot)) {
    return;
  }

  const paths = {
    root: neudRoot,
    data: path.join(neudRoot, "data"),
    databaseFile: path.join(neudRoot, "data", "neud.sqlite"),
    backups: path.join(neudRoot, "data", "backups"),
    projects: path.join(neudRoot, "projects"),
    assets: path.join(neudRoot, "assets"),
    displays: path.join(neudRoot, "displays"),
    controllers: path.join(neudRoot, "controllers"),
    publishing: path.join(neudRoot, "publishing"),
    exports: path.join(neudRoot, "exports"),
    config: path.join(neudRoot, "config"),
    logs: path.join(neudRoot, "logs"),
    engineLogs: path.join(neudRoot, "logs", "engines"),
    engines: path.join(neudRoot, "engines"),
    browserData: path.join(neudRoot, "browser-data"),
    browserProfiles: path.join(neudRoot, "browser-profiles"),
    cookies: path.join(neudRoot, "cookies"),
    cache: path.join(neudRoot, "cache"),
    downloads: path.join(neudRoot, "downloads"),
    serverEnvFile: path.join(neudRoot, "config", "server.env"),
    hostFile: path.join(neudRoot, "config", "host.json"),
    credentialsDir: path.join(neudRoot, "config", "credentials"),
    authCacheFile: path.join(neudRoot, "config", "auth-cache.enc"),
    repoRoot: path.resolve(__dirname, "../.."),
  };

  const store = new CredentialStore(paths);
  const meta = store.getCredentialMeta(engineId);
  if (meta.hasPersistedSession) {
    assert.equal(store.hasRunnableAuth(engineId), true);
  }
});
