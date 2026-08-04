import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { CredentialStore } from "../dist/services/credential-store.js";
import {
  BAG_EXPORT_CREDENTIALS_REQUIRED_MESSAGE,
  CREDENTIAL_RESOLUTION_FAILED_LOG_MESSAGE,
  getBroadArrowCredentialsForProject,
  getProjectWebpageScraperCredentials,
  resolveProjectWebpageScraperEngineId,
} from "../dist/services/project-scraper-auth.js";
import { ProjectsRepository } from "../dist/repositories/projects-repository.js";
import { DataSourcesRepository } from "../dist/repositories/data-sources-repository.js";
import { openLocalDatabase, closeLocalDatabase } from "../dist/database/connection.js";

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

test("scraper credentials UI saves through Electron secure credential IPC", () => {
  const ipc = readSrc("desktop/src/ipc/credentials.ts");
  const store = readSrc("desktop/src/services/credential-store.ts");
  const scraper = readSrc("src/components/data-engines/webpage-scraper/ScraperCredentialsSection.tsx");

  assert.match(ipc, /neud:credentials:save/);
  assert.match(store, /safeStorage\.encryptString/);
  assert.match(store, /credentialsDir/);
  assert.match(scraper, /saveDesktopCredentials\(engineId/);
  assert.doesNotMatch(store, /INSERT INTO.*password/i);
});

test("shared helper resolves webpage scraper engine before credential lookup", () => {
  const auth = readSrc("desktop/src/services/project-scraper-auth.ts");
  const exportService = readSrc("desktop/src/services/offline-auction-export-service.ts");

  assert.match(auth, /resolveProjectWebpageScraperEngineId/);
  assert.match(auth, /getBroadArrowCredentialsForProject/);
  assert.match(auth, /getCredentialsForWorker\(engineId\)/);
  assert.match(exportService, /getBroadArrowCredentialsForProject/);
  assert.match(exportService, /getWebpageScraperEngineId/);
  assert.doesNotMatch(exportService, /getPrimaryEngineId/);
  assert.doesNotMatch(exportService, /engines\[0\]\?\.id/);
});

test("downloader and scraper auth use the same credential helper", () => {
  const auth = readSrc("desktop/src/services/broad-arrow-export-auth.ts");
  const localData = readSrc("desktop/src/services/local-data-service.ts");
  const runner = readSrc("desktop/src/services/broad-arrow-offline-export-runner.ts");

  assert.match(auth, /getProjectWebpageScraperCredentials/);
  assert.match(localData, /getProjectWebpageScraperCredentials/);
  assert.match(runner, /getProjectWebpageScraperCredentials/);
});

test("downloader logs sanitized diagnostic when runnable auth exists without stored credentials", () => {
  const exportService = readSrc("desktop/src/services/offline-auction-export-service.ts");
  assert.match(exportService, /CREDENTIAL_RESOLUTION_FAILED_LOG_MESSAGE/);
  assert.match(exportService, /hasRunnableAuth\(engineId\)/);
  assert.doesNotMatch(exportService, /console\.error\([\s\S]*password/i);
});

test("credentials are not returned through offline export JSON", () => {
  const runner = readSrc("desktop/src/services/broad-arrow-offline-export-runner.ts");
  const exportService = readSrc("desktop/src/services/offline-auction-export-service.ts");
  assert.doesNotMatch(runner, /password[\s\S]{0,40}JSON\.stringify/);
  assert.doesNotMatch(exportService, /getCredentialsForRenderer/);
});

test("project with saved scraper credentials resolves for downloader", async (t) => {
  let secureStorageAvailable = false;
  try {
    const electron = await import("electron");
    secureStorageAvailable = electron.safeStorage?.isEncryptionAvailable?.() === true;
  } catch {
    secureStorageAvailable = false;
  }

  if (!secureStorageAvailable) {
    t.skip("Electron secure storage is unavailable in this test runtime.");
    return;
  }

  const root = path.join(
    os.tmpdir(),
    `neud-cred-share-${crypto.randomUUID().slice(0, 8)}`,
  );
  const paths = buildPaths(root);
  fs.mkdirSync(paths.data, { recursive: true });
  fs.mkdirSync(paths.config, { recursive: true });
  fs.mkdirSync(paths.credentialsDir, { recursive: true });
  fs.mkdirSync(paths.backups, { recursive: true });
  const db = await openLocalDatabase(paths);

  try {
    const projects = new ProjectsRepository(db);
    const dataSources = new DataSourcesRepository(db);
    const credentials = new CredentialStore(paths);
    const project = projects.create({
      name: "Broad Arrow Auctions",
      slug: `broad-arrow-${crypto.randomUUID().slice(0, 6)}`,
      projectType: "bag-graphics",
    });
    dataSources.ensureWebpageScraper(project.id, "bag-graphics");
    const engine = dataSources.getByEngineKey(project.id, "webpage-scraper");
    assert.ok(engine);

    credentials.saveCredentials(engine.id, {
      email: "auction@example.com",
      password: "secret-password",
    });

    const resolvedEngineId = resolveProjectWebpageScraperEngineId(dataSources, project.id);
    assert.equal(resolvedEngineId, engine.id);

    const resolved = getBroadArrowCredentialsForProject({
      credentials,
      dataSources,
      projectId: project.id,
    });
    assert.equal(resolved?.email, "auction@example.com");
    assert.equal(resolved?.password, "secret-password");
    assert.equal(
      getProjectWebpageScraperCredentials(credentials, engine.id)?.email,
      "auction@example.com",
    );
  } finally {
    closeLocalDatabase(db);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("missing credentials keep the user-facing downloader message", () => {
  assert.equal(
    BAG_EXPORT_CREDENTIALS_REQUIRED_MESSAGE,
    "Auction credentials are required before downloading the Current Webpage.",
  );
  assert.match(
    CREDENTIAL_RESOLUTION_FAILED_LOG_MESSAGE,
    /Saved Webpage Scraper credentials could not be resolved for the downloader\./,
  );
});
