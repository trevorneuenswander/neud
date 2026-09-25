#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { openLocalDatabase, closeLocalDatabase } from "../dist/database/connection.js";
import { AppSettingsRepository } from "../dist/repositories/app-settings-repository.js";
import { ProjectsRepository } from "../dist/repositories/projects-repository.js";
import { DisplaysRepository } from "../dist/repositories/displays-repository.js";
import { ProjectDisplayCodeRepository } from "../dist/repositories/project-display-code-repository.js";
import { ProjectCodeRevisionsRepository } from "../dist/repositories/project-code-revisions-repository.js";
import { BroadArrowLegacyDisplaysImportService } from "../dist/services/broad-arrow-legacy-displays-import-service.js";
import { BroadArrowStreamDisplaysImportService } from "../dist/services/broad-arrow-stream-displays-import-service.js";
import { ProjectCodeStorageService } from "../dist/services/project-code-storage-service.js";
import { BROAD_ARROW_CANONICAL_PROJECT } from "../dist/bag/broad-arrow-phase.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const EXPECTED_DISPLAYS = [
  { slug: "stream-bid-display", name: "Stream Bid Display" },
  { slug: "stream-ticker", name: "Stream Ticker" },
  { slug: "led-display-quail", name: "LED Display (Quail)" },
  { slug: "legacy-pylon", name: "Legacy Pylon" },
  { slug: "legacy-ticker", name: "Legacy Ticker" },
];

function createTestPaths(name) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const root = path.join(process.cwd(), `.tmp-broad-arrow-imports-${name}-${suffix}`);
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
    repoRoot,
  };

  for (const dir of [paths.data, paths.backups, paths.config, paths.logs, paths.credentialsDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return paths;
}

function seedBroadArrowProject(db) {
  const now = new Date().toISOString();
  const projectId = crypto.randomUUID();
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
  return projectId;
}

test("legacy import service defines bundled legacy ticker spec", () => {
  const specs = read("desktop/src/displays/broad-arrow-legacy-display-specs.ts");
  assert.match(specs, /LEGACY_TICKER_SPEC/);
  assert.match(specs, /legacy-ticker/);
  assert.match(specs, /auction-ticker-legacy-live-v1-2026-07-26-132400\.html/);
});

test("fresh Broad Arrow install imports all expected displays idempotently", async () => {
  const paths = createTestPaths("four-displays");
  const db = await openLocalDatabase(paths);

  try {
    seedBroadArrowProject(db);
    const settings = new AppSettingsRepository(db);
    const projects = new ProjectsRepository(db);
    const displays = new DisplaysRepository(db);
    const displayCode = new ProjectDisplayCodeRepository(db);
    const revisions = new ProjectCodeRevisionsRepository(db);
    const storage = new ProjectCodeStorageService(paths);

    const legacyImport = new BroadArrowLegacyDisplaysImportService(
      settings,
      projects,
      displays,
      displayCode,
      revisions,
      storage,
      repoRoot,
    );
    const streamImport = new BroadArrowStreamDisplaysImportService(
      settings,
      projects,
      displays,
      displayCode,
      revisions,
      storage,
      repoRoot,
    );

    const firstLegacy = legacyImport.ensureImported();
    const firstStream = streamImport.ensureImported();
    assert.equal(firstLegacy.createdCount, 2);
    assert.ok(firstStream.createdCount >= 2);

    const project = projects.getBySlug(BROAD_ARROW_CANONICAL_PROJECT.slug);
    assert.ok(project);

    const slugs = displayCode
      .listByProject(project.id)
      .map((entry) => entry.slug)
      .sort();

    for (const expected of EXPECTED_DISPLAYS) {
      assert.ok(slugs.includes(expected.slug), `missing ${expected.slug}`);
    }
    assert.equal(slugs.filter((slug) => slug === "legacy-ticker").length, 1);

    const secondLegacy = legacyImport.ensureImported();
    const secondStream = streamImport.ensureImported();
    assert.equal(secondLegacy.createdCount, 0);
    assert.equal(secondStream.createdCount, 0);
    assert.equal(
      displayCode.listByProject(project.id).length,
      EXPECTED_DISPLAYS.length,
    );
  } finally {
    closeLocalDatabase(db);
  }
});

test("legacy ticker bundled source file is registered", () => {
  const bundled = read("desktop/src/lib/bundled-display-sources.ts");
  assert.match(bundled, /auction-ticker-legacy-live-v1-2026-07-26-132400\.html/);
});
