#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openLocalDatabase, closeLocalDatabase } from "../dist/database/connection.js";
import { ProjectsRepository } from "../dist/repositories/projects-repository.js";
import { ProjectDisplayCodeRepository } from "../dist/repositories/project-display-code-repository.js";
import { ProjectCodeRevisionsRepository } from "../dist/repositories/project-code-revisions-repository.js";
import { ProjectCodeStorageService } from "../dist/services/project-code-storage-service.js";
import { LegacyTickerLivePublishService } from "../dist/services/legacy-ticker-live-publish-service.js";
import { writeBundledLegacyTickerLiveRevision } from "../dist/displays/legacy-display-v2-transform.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

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

  const bundledPath = writeBundledLegacyTickerLiveRevision(
    path.join(
      __dirname,
      "../src/displays/bundled/auction-ticker-legacy-live-v1-2026-07-26-132400.html",
    ),
  );
  console.log(`Wrote bundled legacy-live revision: ${bundledPath}`);

  const db = await openLocalDatabase(paths);
  const storage = new ProjectCodeStorageService(paths);
  const service = new LegacyTickerLivePublishService(
    new ProjectsRepository(db),
    new ProjectDisplayCodeRepository(db),
    new ProjectCodeRevisionsRepository(db),
    storage,
  );

  const displaySlug = process.argv[2] ?? "legacy-ticker";
  const slugs =
    process.argv.length > 2
      ? [displaySlug]
      : ["legacy-ticker"];

  for (const slug of slugs) {
    const result = service.publishLegacyTickerLive({ displaySlug: slug });
    console.log(JSON.stringify({ slug, ...result }, null, 2));
  }
  await closeLocalDatabase(db);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
