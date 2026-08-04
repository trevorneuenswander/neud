import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { CredentialStore } from "../dist/services/credential-store.js";
import {
  assertComprehensiveExportAuthentication,
  canRunAuthenticatedComprehensiveExport,
  hasProjectScraperRunnableAuth,
  MissingScraperCredentialsError,
} from "../dist/services/project-scraper-auth.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function buildPaths(root) {
  return {
    root,
    data: path.join(root, "data"),
    databaseFile: path.join(root, "data", "neud.sqlite"),
    backups: path.join(root, "data", "backups"),
    projects: path.join(root, "projects"),
    assets: path.join(root, "assets"),
    displays: path.join(root, "displays"),
    controllers: path.join(root, "controllers"),
    publishing: path.join(root, "publishing"),
    exports: path.join(root, "exports"),
    config: path.join(root, "config"),
    logs: path.join(root, "logs"),
    engineLogs: path.join(root, "logs", "engines"),
    engines: path.join(root, "engines"),
    browserData: path.join(root, "browser-data"),
    browserProfiles: path.join(root, "browser-profiles"),
    cookies: path.join(root, "cookies"),
    cache: path.join(root, "cache"),
    downloads: path.join(root, "downloads"),
    serverEnvFile: path.join(root, "config", "server.env"),
    hostFile: path.join(root, "config", "host.json"),
    credentialsDir: path.join(root, "config", "credentials"),
    authCacheFile: path.join(root, "config", "auth-cache.enc"),
    repoRoot,
  };
}

test("project scraper auth module exposes canonical credential helpers", () => {
  const auth = readSrc("desktop/src/services/project-scraper-auth.ts");
  assert.match(auth, /export function getProjectWebpageScraperCredentials/);
  assert.match(auth, /export function hasProjectScraperRunnableAuth/);
  assert.match(auth, /export function canRunAuthenticatedComprehensiveExport/);
  assert.match(auth, /export function assertComprehensiveExportAuthentication/);
  assert.match(auth, /missing-scraper-credentials/);
  assert.match(
    auth,
    /Webpage Scraper credentials are required before downloading the Current Webpage\./,
  );
});

test("dedicated export runner checks secure credentials in desktop process", () => {
  const exportService = readSrc("desktop/src/services/offline-auction-export-service.ts");
  const runner = readSrc("desktop/src/services/broad-arrow-offline-export-runner.ts");
  const auth = readSrc("desktop/src/services/project-scraper-auth.ts");

  assert.match(exportService, /getBroadArrowCredentialsForProject/);
  assert.match(runner, /getProjectWebpageScraperCredentials/);
  assert.match(auth, /getBroadArrowCredentialsForProject/);
});

test("worker export bootstraps adapter without blocking live poll loop", () => {
  const runtime = readSrc("workers/data-engine/src/engine-runtime.js");
  assert.match(runtime, /void processPendingExportCommand\(\)/);
  assert.doesNotMatch(runtime, /await processPendingExportCommand\(\)/);
  assert.match(runtime, /if \(!adapter\) \{/);
  assert.match(runtime, /await adapter\.start\(bundle\)/);
});

test("hasRunnableAuth accepts persisted session cookies without stored credential file", (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "neud-scraper-auth-"));
  t.after(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  const engineId = "a611842e-303e-4663-8fc8-2c44599aaebc";
  const paths = buildPaths(tempRoot);
  fs.mkdirSync(paths.cookies, { recursive: true });
  fs.writeFileSync(
    path.join(paths.cookies, `${engineId}.json`),
    JSON.stringify([{ name: "session", value: "abc", domain: "example.com" }]),
  );

  const store = new CredentialStore(paths);

  assert.equal(store.getCredentialsForWorker(engineId), null);
  assert.equal(store.hasRunnableAuth(engineId), true);
  assert.equal(hasProjectScraperRunnableAuth(store, paths, engineId), true);
  assert.equal(
    canRunAuthenticatedComprehensiveExport({
      credentials: store,
      paths,
      engineId,
      engineManager: null,
    }),
    true,
  );
});

test("assertComprehensiveExportAuthentication rejects when no auth sources exist", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "neud-scraper-auth-empty-"));
  const paths = buildPaths(tempRoot);
  const store = new CredentialStore(paths);
  const engineId = "a611842e-303e-4663-8fc8-2c44599aaebc";

  assert.throws(
    () =>
      assertComprehensiveExportAuthentication({
        credentials: store,
        paths,
        engineId,
        engineManager: { hasAuthenticatedExportContext: () => false },
      }),
    MissingScraperCredentialsError,
  );

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("offline export IPC forwards missing credential error code", () => {
  const ipc = readSrc("desktop/src/ipc/offline-auction.ts");
  assert.match(ipc, /code: result\.code/);
});
