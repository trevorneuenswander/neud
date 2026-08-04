import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openLocalDatabase, closeLocalDatabase } from "../dist/database/connection.js";
import { ProjectsRepository } from "../dist/repositories/projects-repository.js";
import { DisplaysRepository } from "../dist/repositories/displays-repository.js";
import { ProjectDisplayCodeRepository } from "../dist/repositories/project-display-code-repository.js";
import { BROAD_ARROW_CANONICAL_PROJECT } from "../dist/bag/broad-arrow-phase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

function readSrc(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function createTestPaths(name) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const root = path.join(process.cwd(), `.tmp-first-display-${name}-${suffix}`);
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
  for (const dir of [paths.data, paths.backups, paths.projects, paths.config, paths.logs, paths.credentialsDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return paths;
}

test("Broad Arrow listProjectDisplays does not require existing seeded displays", () => {
  const localData = readSrc("desktop/src/services/local-data-service.ts");
  assert.match(localData, /isBroadArrowCanonicalProject\(project\)/);
  assert.match(localData, /this\.displays\s*\n?\s*\.listByProject\(projectId\)/);
});

test("create display workflow supports first display defaults", () => {
  const service = readSrc("desktop/src/services/developer-tools-service.ts");
  assert.match(service, /createDisplay\(/);
  assert.match(service, /normalizeDisplayRefreshRateMs/);
  assert.match(service, /DEFAULT_DISPLAY_WIDTH/);
  assert.match(service, /enabled: false/);
  assert.match(service, /Initial uploaded HTML/);
});

test("first display row can be inserted into an empty Broad Arrow project", async () => {
  const paths = createTestPaths("empty");
  const db = await openLocalDatabase(paths);
  const projectId = crypto.randomUUID();
  const displayId = crypto.randomUUID();
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

  const displays = new DisplaysRepository(db);
  displays.upsert({
    id: displayId,
    projectId,
    name: "First Display",
    displayKey: "first-display",
    htmlPath: null,
    enabled: false,
    refreshRateMs: 5000,
    displayWidth: 1920,
    displayHeight: 1080,
    settings: { displayType: "project-html" },
  });

  new ProjectDisplayCodeRepository(db).upsert({
    displayId,
    projectId,
    slug: "first-display",
    description: "First uploaded display",
    sourceType: "project-html",
    archived: false,
  });

  const rows = displays.listByProject(projectId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].enabled, false);
  assert.equal(rows[0].refreshRateMs, 5000);
  assert.equal(rows[0].displayWidth, 1920);
  assert.equal(rows[0].displayHeight, 1080);

  await closeLocalDatabase(db);
  fs.rmSync(paths.root, { recursive: true, force: true });
});

test("displays page shows empty state copy for Broad Arrow", () => {
  const client = readSrc("src/components/displays/DisplaysPageClient.tsx");
  assert.match(client, /No displays have been added\./);
});
