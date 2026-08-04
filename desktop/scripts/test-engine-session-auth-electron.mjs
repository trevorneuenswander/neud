import { app, safeStorage } from "electron";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const engineId = "a611842e-303e-4663-8fc8-2c44599aaebc";

async function main() {
  await app.whenReady();

  const { CredentialStore } = await import("../dist/services/credential-store.js");
  const neudRoot = path.join(os.homedir(), "AppData", "Roaming", "NEUD");
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

  assert.equal(safeStorage.isEncryptionAvailable(), true, "secure storage required");

  const store = new CredentialStore(paths);
  const meta = store.getCredentialMeta(engineId);
  console.log(
    JSON.stringify({
      hasCredentials: meta.hasCredentials,
      hasPersistedSession: meta.hasPersistedSession,
      hasRunnableAuth: store.hasRunnableAuth(engineId),
    }),
  );

  assert.equal(meta.hasPersistedSession, true, "expected migrated session cookies");
  assert.equal(store.hasRunnableAuth(engineId), true, "engine should be runnable via cookies");

  app.quit();
}

main().catch((error) => {
  console.error(error);
  app.exit(1);
});
