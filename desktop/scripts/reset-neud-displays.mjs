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
import { UserDisplayOrderRepository } from "../dist/repositories/user-display-order-repository.js";
import { DisplaySyncQueueRepository } from "../dist/repositories/display-sync-queue-repository.js";
import { DisplayDeletionTombstonesRepository } from "../dist/repositories/display-deletion-tombstones-repository.js";
import { AppSettingsRepository } from "../dist/repositories/app-settings-repository.js";
import { ActivityEventsRepository } from "../dist/repositories/activity-events-repository.js";
import { ProjectCodeStorageService } from "../dist/services/project-code-storage-service.js";
import { BroadArrowDisplayResetService } from "../dist/services/broad-arrow-display-reset-service.js";
import { BROAD_ARROW_CANONICAL_PROJECT } from "../dist/bag/broad-arrow-phase.js";

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
    console.error(`[DisplayReset] Database not found: ${paths.databaseFile}`);
    process.exit(1);
  }

  const db = await openLocalDatabase(paths);
  const projects = new ProjectsRepository(db);
  const displays = new DisplaysRepository(db);
  const displayCode = new ProjectDisplayCodeRepository(db);
  const revisions = new ProjectCodeRevisionsRepository(db);
  const userDisplayOrder = new UserDisplayOrderRepository(db);
  const syncQueue = new DisplaySyncQueueRepository(db);
  const tombstones = new DisplayDeletionTombstonesRepository(db);
  const settings = new AppSettingsRepository(db);
  const activityEvents = new ActivityEventsRepository(db);
  const storage = new ProjectCodeStorageService(paths);

  // Trusted developer script — local SQLite reset only.
  // Cloud display tombstones sync through the signed-in desktop app (authenticated RLS).
  const cloudClient = null;

  if (!cloudClient) {
    console.warn("[DisplayReset] Cloud cleanup skipped; run display sync from signed-in NEUD desktop if needed.");
  }

  const resetService = new BroadArrowDisplayResetService(
    db,
    projects,
    displays,
    displayCode,
    revisions,
    userDisplayOrder,
    syncQueue,
    tombstones,
    storage,
    settings,
    cloudClient,
  );

  const project = resetService.resolveBroadArrowProject();
  const before = resetService.countDisplays(project.id);
  console.info(
    `[DisplayReset] Target=${BROAD_ARROW_CANONICAL_PROJECT.name} active=${before.active} archived=${before.archived}`,
  );

  const result = await resetService.reset({
    syncCloud: Boolean(cloudClient),
  });

  activityEvents.insert({
    type: "developer-tools.display-reset",
    message: `Removed all displays from "${BROAD_ARROW_CANONICAL_PROJECT.name}" for a clean display reset.`,
    source: "developer-tools",
    severity: "info",
    metadata: {
      projectId: result.projectId,
      projectSlug: result.projectSlug,
      removedActive: result.removedActive,
      removedArchived: result.removedArchived,
      tombstonesCreated: result.tombstonesCreated,
      cloudDisplaysRemoved: result.cloudDisplaysRemoved,
      cloudRevisionsRemoved: result.cloudRevisionsRemoved,
    },
  });

  const after = resetService.countDisplays(project.id);
  console.info(
    `[DisplayReset] Complete active=${after.active} archived=${after.archived} tombstones=${result.tombstonesCreated}`,
  );

  await closeLocalDatabase(db);

  if (after.active !== 0 || after.archived !== 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("[DisplayReset] Failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
