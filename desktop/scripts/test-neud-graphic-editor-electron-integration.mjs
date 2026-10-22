#!/usr/bin/env node
/**
 * Pass 18 Electron-equivalent integration — Graphic Editor persistence, assets,
 * .neudgraphic round-trip, and IPC/menu contract wiring (no live Electron GUI).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

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

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function createTestPaths(name) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const root = path.join(process.cwd(), `.tmp-pass18-editor-integration-${name}-${suffix}`);
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
    repoRoot,
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

function createAuthStub(role = "owner") {
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
  ).run(projectId, "SEMA Demo", "sema-demo", "bag-graphics", now, now);
}

async function createDeveloperToolsService(paths) {
  const db = await openLocalDatabase(paths);
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
  return { db, projectId, displays, service, storage };
}

function buildPass18TestSchema(schemaMod, assetRelativePath) {
  const base = schemaMod.createDefaultSemaScheduleTickerEditableSchema();
  const rect = schemaMod.createEmptyLayer("rect", {
    id: "pass18-rect",
    name: "Pass18 Rect",
    x: 40,
    y: 40,
    width: 120,
    height: 80,
    zIndex: 10,
    style: { fill: "#336699", stroke: "#ffffff", strokeWidth: 2 },
  });
  const image = schemaMod.createEmptyLayer("image", {
    id: "pass18-image",
    name: "Pass18 Image",
    x: 200,
    y: 40,
    width: 64,
    height: 64,
    zIndex: 11,
    content: { src: assetRelativePath },
    assetId: assetRelativePath,
    style: { objectFit: "contain" },
  });
  const text = schemaMod.createEmptyLayer("text", {
    id: "pass18-text",
    name: "Pass18 Binding",
    x: 40,
    y: 160,
    width: 400,
    height: 72,
    zIndex: 12,
    content: { text: "", textMode: "data" },
    dataBinding: "now.title",
    style: {
      fontSize: 36,
      color: "#ffffff",
      align: "left",
    },
  });
  return {
    ...base,
    layers: [...base.layers, rect, image, text],
  };
}

test("Pass 18 Electron-equivalent integration: IPC + File menu + preload contracts", () => {
  const editorIpc = read("desktop/src/ipc/editor.ts");
  const preload = read("desktop/src/preload.ts");
  const menu = read("desktop/src/menu/application-menu.ts");
  const api = read("src/lib/local/editable-graphic-api.ts");
  const client = read("src/components/editor/GraphicEditorClient.tsx");

  assert.match(editorIpc, /neud:editor:getEditableSchema/);
  assert.match(editorIpc, /neud:editor:saveEditableSchema/);
  assert.match(editorIpc, /neud:editor:importDisplayAsset/);
  assert.match(editorIpc, /neud:editor:pickImageFile/);
  assert.match(preload, /getEditableSchema/);
  assert.match(preload, /saveEditableSchema/);
  assert.match(preload, /importDisplayAsset/);
  assert.match(preload, /onMenuAction/);
  assert.match(preload, /neud:editor:menu/);
  assert.match(menu, /installGraphicEditorApplicationMenu/);
  assert.match(menu, /Save Draft/);
  assert.match(menu, /NEUD Graphic/);
  assert.match(api, /localSaveEditableGraphicSchema/);
  assert.match(api, /localImportDisplayAsset/);
  assert.match(client, /onMenuAction/);
  assert.match(client, /localSaveEditableGraphicSchema/);
});

test("Pass 18 Electron-equivalent integration: DeveloperToolsService persistence + assets + .neudgraphic", async () => {
  const schemaMod = require(
    path.join(repoRoot, "desktop/dist/packages/sema/editable-graphic-schema.js"),
  );
  const neudPkg = await import(
    pathToFileURL(path.join(repoRoot, "src/lib/editor/neudgraphic-package.ts")).href
  );

  const paths = createTestPaths("service");
  const { db, projectId, displays, service, storage } = await createDeveloperToolsService(paths);

  try {
    const display = displays.upsert({
      projectId,
      name: "Schedule Ticker Editable",
      displayKey: "schedule-ticker-editable",
      enabled: true,
      settings: {
        editorSchemaVersion: 2,
        graphicType: schemaMod.SCHEDULE_TICKER_EDITABLE_GRAPHIC_TYPE,
        editableGraphicSchema: schemaMod.createDefaultSemaScheduleTickerEditableSchema(),
      },
    });

    const imported = service.importDisplayAsset("sema-demo", display.id, {
      fileName: "pass18-pixel.png",
      mimeType: "image/png",
      dataBase64: TINY_PNG_BASE64,
    });
    assert.match(imported.relativePath, /^assets\//);
    assert.ok(imported.relativePath.endsWith(".png"));

    const assetOnDisk = storage.readDisplayAsset(projectId, display.id, imported.fileName);
    assert.ok(assetOnDisk?.absolutePath);
    assert.ok(fs.existsSync(assetOnDisk.absolutePath));
    const written = fs.readFileSync(assetOnDisk.absolutePath);
    assert.ok(written.length > 0);

    const schema = buildPass18TestSchema(schemaMod, imported.relativePath);
    const saved = service.saveEditableGraphicSchema("sema-demo", display.id, schema);
    assert.equal(saved.published, false);
    assert.equal(saved.editableGraphicSchema.schemaVersion, 2);

    const reloaded = service.getEditableGraphicSchema("sema-demo", display.id);
    const layerIds = reloaded.editableGraphicSchema.layers.map((layer) => layer.id);
    assert.ok(layerIds.includes("pass18-rect"));
    assert.ok(layerIds.includes("pass18-image"));
    assert.ok(layerIds.includes("pass18-text"));

    const textLayer = reloaded.editableGraphicSchema.layers.find((l) => l.id === "pass18-text");
    assert.equal(textLayer?.dataBinding, "now.title");
    assert.equal(textLayer?.content?.textMode, "data");

    const imageLayer = reloaded.editableGraphicSchema.layers.find((l) => l.id === "pass18-image");
    assert.equal(imageLayer?.content?.src, imported.relativePath);

    const fromDb = displays.getById(display.id);
    const settings =
      fromDb?.settings && typeof fromDb.settings === "object" ? fromDb.settings : {};
    assert.deepEqual(
      (settings.editableGraphicSchema ?? {}).layers?.map((l) => l.id),
      reloaded.editableGraphicSchema.layers.map((l) => l.id),
    );

    const pkg = neudPkg.buildNeudGraphicPackage({
      schema: reloaded.editableGraphicSchema,
      displayName: "Pass 18 Integration",
    });
    const serialized = neudPkg.serializeNeudGraphicPackage(pkg);
    const parsed = neudPkg.parseNeudGraphicPackage(JSON.parse(serialized));
    assert.equal(parsed.manifest.formatVersion, "1");
    assert.equal(parsed.manifest.displayName, "Pass 18 Integration");
    assert.equal(parsed.schema.layers.find((l) => l.id === "pass18-text")?.dataBinding, "now.title");
    assert.equal(
      parsed.schema.layers.find((l) => l.id === "pass18-image")?.content?.src,
      imported.relativePath,
    );
  } finally {
    closeLocalDatabase(db);
    fs.rmSync(paths.root, { recursive: true, force: true });
  }
});
