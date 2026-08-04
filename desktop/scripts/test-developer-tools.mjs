import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openLocalDatabase, closeLocalDatabase } from "../dist/database/connection.js";
import { ProjectsRepository } from "../dist/repositories/projects-repository.js";
import { DisplaysRepository } from "../dist/repositories/displays-repository.js";
import { AppSettingsRepository } from "../dist/repositories/app-settings-repository.js";
import { DataSourcesRepository } from "../dist/repositories/data-sources-repository.js";
import { ProjectScraperCodeRepository } from "../dist/repositories/project-scraper-code-repository.js";
import { ProjectDisplayCodeRepository } from "../dist/repositories/project-display-code-repository.js";
import {
  ProjectCodeRevisionsRepository,
  ProjectValidationLogsRepository,
} from "../dist/repositories/project-code-revisions-repository.js";
import { ProjectCodeStorageService } from "../dist/services/project-code-storage-service.js";
import {
  DeveloperToolsService,
  ProjectCodeMigrationService,
} from "../dist/services/developer-tools-service.js";
import { validateScraperSource } from "../dist/services/scraper-code-validation-service.js";
import { validateDisplaySource } from "../dist/services/display-code-validation-service.js";
import { resolvePathWithinRoot } from "../dist/developer-tools/path-utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createTestPaths(name) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const root = path.join(process.cwd(), `.tmp-dev-tools-${name}-${suffix}`);
  const paths = {
    root,
    data: path.join(root, "data"),
    databaseFile: path.join(root, "data", "test.sqlite"),
    backups: path.join(root, "backups"),
    projects: path.join(root, "projects"),
    config: path.join(root, "config"),
    logs: path.join(root, "logs"),
    credentialsDir: path.join(root, "config", "credentials"),
    authCacheFile: path.join(root, "config", "auth-cache.enc"),
    repoRoot: path.resolve(__dirname, "../.."),
  };
  for (const dir of [paths.data, paths.backups, paths.projects, paths.config, paths.logs, paths.credentialsDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return paths;
}

function createAuthStub(role) {
  return {
    isAccessAllowed: () => Boolean(role),
    getAuthenticatedUser: () =>
      role
        ? {
            userId: "owner-user",
            email: "owner@example.com",
            role,
          }
        : null,
    getStatus: () => ({ role, allowed: Boolean(role) }),
  };
}

function seedProject(db, projectId) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO projects (
      id, name, slug, project_type, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 1, ?, ?)`,
  ).run(projectId, "Broad Arrow", "broad-arrow-auctions", "bag-graphics", now, now);
}

test("developer tools path utils reject traversal", () => {
  assert.throws(() => resolvePathWithinRoot("/tmp/root", "..", "secret"), /traversal/i);
});

test("CommonJS require is rejected by scraper validation", () => {
  const result = validateScraperSource(
    'const puppeteer = require("puppeteer");\nexport async function createScraper() { return { start(){}, stop(){}, runOnce(){}, dispose(){} }; }',
  );
  assert.equal(result.ok, false);
  assert.match(result.issues[0]?.message ?? "", /CommonJS require/i);
});

test("invalid scraper source cannot validate", () => {
  const result = validateScraperSource("export function nope() {}");
  assert.equal(result.ok, false);
});

test("valid display slug passes validation", () => {
  const result = validateDisplaySource({
    slug: "lower-third",
    html: "<div>Hello</div>",
    css: ".display-root { color: white; }",
    javascript: "console.log('ok');",
  });
  assert.equal(result.ok, true);
});

test("owner can access developer tools and migration is idempotent", async () => {
  const paths = createTestPaths("owner");
  const db = await openLocalDatabase(paths);

  try {
    const projectId = crypto.randomUUID();
    seedProject(db, projectId);
    const projects = new ProjectsRepository(db);
    const displays = new DisplaysRepository(db);
    const settings = new AppSettingsRepository(db);
    const scraperCode = new ProjectScraperCodeRepository(db);
    const displayCode = new ProjectDisplayCodeRepository(db);
    const revisions = new ProjectCodeRevisionsRepository(db);
    const validationLogs = new ProjectValidationLogsRepository(db);
    const storage = new ProjectCodeStorageService(paths);
    const migration = new ProjectCodeMigrationService(
      settings,
      projects,
      displays,
      displayCode,
      scraperCode,
      revisions,
      storage,
      paths.repoRoot,
    );
    const service = new DeveloperToolsService(
      projects,
      displays,
      scraperCode,
      displayCode,
      revisions,
      validationLogs,
      storage,
      migration,
      createAuthStub("owner"),
      { getProjectRole: () => "owner", countForUser: () => 1 },
      new DataSourcesRepository(db),
      null,
    );

    displays.upsert({
      projectId,
      name: "Pylon v5",
      displayKey: "pylon",
      enabled: true,
    });

    const first = migration.ensureProjectMigrated(projectId, "owner-user");
    const second = migration.ensureProjectMigrated(projectId, "owner-user");
    assert.equal(first.migrated, true);
    assert.equal(second.migrated, false);

    const scraper = service.getScraperBundle("broad-arrow-auctions");
    assert.ok(scraper.draftSource?.includes("createScraper"));

    const access = service.assertDeveloperToolsAccess(projectId);
    assert.equal(access.role, "owner");
  } finally {
    closeLocalDatabase(db);
  }
});

test("operator is denied developer tools access", async () => {
  const paths = createTestPaths("operator");
  const db = await openLocalDatabase(paths);

  try {
    const projectId = crypto.randomUUID();
    seedProject(db, projectId);
    const projects = new ProjectsRepository(db);
    const displays = new DisplaysRepository(db);
    const settings = new AppSettingsRepository(db);
    const scraperCode = new ProjectScraperCodeRepository(db);
    const displayCode = new ProjectDisplayCodeRepository(db);
    const revisions = new ProjectCodeRevisionsRepository(db);
    const validationLogs = new ProjectValidationLogsRepository(db);
    const storage = new ProjectCodeStorageService(paths);
    const migration = new ProjectCodeMigrationService(
      settings,
      projects,
      displays,
      displayCode,
      scraperCode,
      revisions,
      storage,
      paths.repoRoot,
    );
    const service = new DeveloperToolsService(
      projects,
      displays,
      scraperCode,
      displayCode,
      revisions,
      validationLogs,
      storage,
      migration,
      createAuthStub("operator"),
      { getProjectRole: () => "operator", countForUser: () => 0 },
      new DataSourcesRepository(db),
      null,
    );

    assert.throws(
      () => service.getScraperBundle("broad-arrow-auctions"),
      /owners and admins/i,
    );
  } finally {
    closeLocalDatabase(db);
  }
});

test("duplicate display creates disabled copy with new slug", async () => {
  const paths = createTestPaths("duplicate");
  const db = await openLocalDatabase(paths);

  try {
    const projectId = crypto.randomUUID();
    seedProject(db, projectId);
    const projects = new ProjectsRepository(db);
    const displays = new DisplaysRepository(db);
    const settings = new AppSettingsRepository(db);
    const scraperCode = new ProjectScraperCodeRepository(db);
    const displayCode = new ProjectDisplayCodeRepository(db);
    const revisions = new ProjectCodeRevisionsRepository(db);
    const validationLogs = new ProjectValidationLogsRepository(db);
    const storage = new ProjectCodeStorageService(paths);
    const migration = new ProjectCodeMigrationService(
      settings,
      projects,
      displays,
      displayCode,
      scraperCode,
      revisions,
      storage,
      paths.repoRoot,
    );
    const service = new DeveloperToolsService(
      projects,
      displays,
      scraperCode,
      displayCode,
      revisions,
      validationLogs,
      storage,
      migration,
      createAuthStub("owner"),
      { getProjectRole: () => "owner", countForUser: () => 1 },
      new DataSourcesRepository(db),
      null,
    );

    const source = displays.upsert({
      projectId,
      name: "Custom Panel",
      displayKey: "custom-panel",
      enabled: true,
    });
    migration.ensureProjectMigrated(projectId, "owner-user");

    const duplicate = service.duplicateDisplay("broad-arrow-auctions", source.id, {
      name: "Custom Panel Copy",
      slug: "custom-panel-copy",
    });
    assert.notEqual(duplicate.displayId, source.id);

    const copy = displays.getById(duplicate.displayId);
    assert.equal(copy?.enabled, false);
    assert.equal(displayCode.getBySlug(projectId, "custom-panel-copy")?.slug, "custom-panel-copy");
  } finally {
    closeLocalDatabase(db);
  }
});

test("cross-project display viewer is denied", async () => {
  const paths = createTestPaths("viewer");
  const db = await openLocalDatabase(paths);

  try {
    const projectA = crypto.randomUUID();
    const projectB = crypto.randomUUID();
    seedProject(db, projectA);
    db.prepare(
      `INSERT INTO projects (
        id, name, slug, project_type, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 1, ?, ?)`,
    ).run(
      projectB,
      "Other Project",
      "other-project",
      "bag-graphics",
      new Date().toISOString(),
      new Date().toISOString(),
    );

    const projects = new ProjectsRepository(db);
    const displays = new DisplaysRepository(db);
    const settings = new AppSettingsRepository(db);
    const scraperCode = new ProjectScraperCodeRepository(db);
    const displayCode = new ProjectDisplayCodeRepository(db);
    const revisions = new ProjectCodeRevisionsRepository(db);
    const validationLogs = new ProjectValidationLogsRepository(db);
    const storage = new ProjectCodeStorageService(paths);
    const migration = new ProjectCodeMigrationService(
      settings,
      projects,
      displays,
      displayCode,
      scraperCode,
      revisions,
      storage,
      paths.repoRoot,
    );
    const service = new DeveloperToolsService(
      projects,
      displays,
      scraperCode,
      displayCode,
      revisions,
      validationLogs,
      storage,
      migration,
      createAuthStub("owner"),
      { getProjectRole: () => "owner", countForUser: () => 1 },
      new DataSourcesRepository(db),
      null,
      null,
      "http://127.0.0.1:17345",
    );

    const display = displays.upsert({
      projectId: projectA,
      name: "Panel A",
      displayKey: "panel-a",
      enabled: true,
    });
    migration.ensureProjectMigrated(projectA, "owner-user");

    const resolved = service.resolveDisplayViewer(projectA, "panel-a");
    assert.equal(resolved.status, "ok");

    const wrongProject = service.resolveDisplayViewer(projectB, "panel-a");
    assert.equal(wrongProject.status, "not_found");
  } finally {
    closeLocalDatabase(db);
  }
});
