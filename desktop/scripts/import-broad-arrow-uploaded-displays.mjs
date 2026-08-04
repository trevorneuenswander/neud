#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openLocalDatabase, closeLocalDatabase } from "../dist/database/connection.js";
import { ProjectsRepository } from "../dist/repositories/projects-repository.js";
import { DisplaysRepository } from "../dist/repositories/displays-repository.js";
import { ProjectDisplayCodeRepository } from "../dist/repositories/project-display-code-repository.js";
import { ProjectCodeRevisionsRepository } from "../dist/repositories/project-code-revisions-repository.js";
import { AppSettingsRepository } from "../dist/repositories/app-settings-repository.js";
import { ProjectCodeStorageService } from "../dist/services/project-code-storage-service.js";
import { BroadArrowUploadedDisplaysImportService } from "../dist/services/broad-arrow-uploaded-displays-import-service.js";
import {
  AUCTION_PYLON_DISPLAY_SPEC,
  AUCTION_TICKER_OVERLAY_SPEC,
} from "../dist/displays/broad-arrow-uploaded-display-specs.js";
import {
  transformLegacySrcPollingPylonHtmlV1ToV2,
  transformLegacySrcPollingTickerHtmlV1ToV2,
} from "../dist/displays/legacy-display-v2-transform.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function resolveCliAppPaths() {
  const appDataRoot = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
  const root = path.join(appDataRoot, "NEUD");
  const dataDir = path.join(root, "data");

  return {
    root,
    data: dataDir,
    databaseFile: path.join(dataDir, "neud.sqlite"),
    backups: path.join(dataDir, "backups"),
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

async function main() {
  const paths = resolveCliAppPaths();
  if (!fs.existsSync(paths.databaseFile)) {
    console.error(`Database not found: ${paths.databaseFile}`);
    process.exit(1);
  }

  const db = await openLocalDatabase(paths);
  const storage = new ProjectCodeStorageService(paths);
  const service = new BroadArrowUploadedDisplaysImportService(
    new AppSettingsRepository(db),
    new ProjectsRepository(db),
    new DisplaysRepository(db),
    new ProjectDisplayCodeRepository(db),
    new ProjectCodeRevisionsRepository(db),
    storage,
    paths.repoRoot,
  );

  const result = service.ensureImported();
  console.log(JSON.stringify(result, null, 2));
  await closeLocalDatabase(db);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
