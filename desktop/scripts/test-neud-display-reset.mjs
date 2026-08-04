import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
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
import { ProjectCodeStorageService } from "../dist/services/project-code-storage-service.js";
import { BroadArrowDisplayResetService } from "../dist/services/broad-arrow-display-reset-service.js";
import { BROAD_ARROW_CANONICAL_PROJECT } from "../dist/bag/broad-arrow-phase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createTestPaths(name) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const root = path.join(process.cwd(), `.tmp-display-reset-${name}-${suffix}`);
  const paths = {
    root,
    data: path.join(root, "data"),
    databaseFile: path.join(root, "data", "test.sqlite"),
    backups: path.join(root, "backups"),
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
    repoRoot: path.resolve(__dirname, "../.."),
  };
  for (const dir of [
    paths.data,
    paths.backups,
    paths.projects,
    paths.config,
    paths.logs,
    paths.credentialsDir,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return paths;
}

function seedBroadArrowProject(db, projectId) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO projects (
      id, name, slug, project_type, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 1, ?, ?)`,
  ).run(
    projectId,
    BROAD_ARROW_CANONICAL_PROJECT.name,
    BROAD_ARROW_CANONICAL_PROJECT.slug,
    BROAD_ARROW_CANONICAL_PROJECT.projectType,
    now,
    now,
  );
}

function seedOtherProject(db, projectId) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO projects (
      id, name, slug, project_type, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 1, ?, ?)`,
  ).run(projectId, "Other Auction", "other-auction", "bag-graphics", now, now);
}

function seedDisplay(db, input) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO displays (
      id, project_id, name, display_key, html_path, settings_json, enabled,
      refresh_rate_ms, display_width, display_height, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, '{}', ?, 5000, 1920, 1080, ?, ?)`,
  ).run(
    input.id,
    input.projectId,
    input.name,
    input.displayKey,
    input.htmlPath ?? null,
    input.enabled ? 1 : 0,
    now,
    now,
  );
  db.prepare(
    `INSERT INTO project_display_code (
      display_id, project_id, slug, source_type, archived, updated_at
    ) VALUES (?, ?, ?, 'project-html', ?, ?)`,
  ).run(input.id, input.projectId, input.slug, input.archived ? 1 : 0, now);
}

test("display reset removes only Broad Arrow displays transactionally", async () => {
  const paths = createTestPaths("broad-arrow");
  const db = await openLocalDatabase(paths);
  const broadArrowId = crypto.randomUUID();
  const otherProjectId = crypto.randomUUID();
  const activeDisplayId = crypto.randomUUID();
  const archivedDisplayId = crypto.randomUUID();
  const otherDisplayId = crypto.randomUUID();

  seedBroadArrowProject(db, broadArrowId);
  seedOtherProject(db, otherProjectId);
  seedDisplay(db, {
    id: activeDisplayId,
    projectId: broadArrowId,
    name: "Active Display",
    displayKey: "active-display",
    slug: "active-display",
    enabled: false,
    archived: false,
  });
  seedDisplay(db, {
    id: archivedDisplayId,
    projectId: broadArrowId,
    name: "Archived Display",
    displayKey: "archived-display",
    slug: "archived-display",
    enabled: false,
    archived: true,
  });
  seedDisplay(db, {
    id: otherDisplayId,
    projectId: otherProjectId,
    name: "Other Project Display",
    displayKey: "other-display",
    slug: "other-display",
    enabled: true,
    archived: false,
  });

  const resetService = new BroadArrowDisplayResetService(
    db,
    new ProjectsRepository(db),
    new DisplaysRepository(db),
    new ProjectDisplayCodeRepository(db),
    new ProjectCodeRevisionsRepository(db),
    new UserDisplayOrderRepository(db),
    new DisplaySyncQueueRepository(db),
    new DisplayDeletionTombstonesRepository(db),
    new ProjectCodeStorageService(paths),
    new AppSettingsRepository(db),
    null,
  );

  const before = resetService.countDisplays(broadArrowId);
  assert.equal(before.active, 1);
  assert.equal(before.archived, 1);

  const result = await resetService.reset({ syncCloud: false });
  assert.equal(result.removedActive, 1);
  assert.equal(result.removedArchived, 1);

  const after = resetService.countDisplays(broadArrowId);
  assert.equal(after.active, 0);
  assert.equal(after.archived, 0);

  const otherDisplay = new DisplaysRepository(db).getById(otherDisplayId);
  assert.ok(otherDisplay, "other project display must remain");

  const project = new ProjectsRepository(db).getById(broadArrowId);
  assert.ok(project, "Broad Arrow project must remain");

  await closeLocalDatabase(db);
  fs.rmSync(paths.root, { recursive: true, force: true });
});

test("auto-seed guards skip Broad Arrow canonical project", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../src/bag/broad-arrow-phase.ts"),
    "utf8",
  );
  assert.match(source, /shouldAutoSeedBagDisplays/);
  assert.match(source, /broad-arrow-auctions/);

  const localData = fs.readFileSync(
    path.join(__dirname, "../src/services/local-data-service.ts"),
    "utf8",
  );
  assert.match(localData, /isBroadArrowCanonicalProject\(project\)/);
  assert.match(localData, /shouldAutoSeedBagDisplays\(project\)/);
});

test("reset script is registered and scoped to Broad Arrow", () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../../package.json"), "utf8"),
  );
  assert.ok(pkg.scripts["reset:neud-displays"]);

  const script = fs.readFileSync(
    path.join(__dirname, "reset-neud-displays.mjs"),
    "utf8",
  );
  assert.match(script, /BroadArrowDisplayResetService/);
  assert.match(script, /resolveBroadArrowProject/);
});
