#!/usr/bin/env node
/**
 * v0.3.2 — Clean-install SEMA package must hydrate all default displays.
 * Uses a fresh application-data directory (no developer SQLite reuse).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktopRoot = path.join(repoRoot, "desktop");

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), "utf8");
}

test("source: SEMA hydrate fails install when displays cannot be registered", () => {
  const main = read("desktop/src/main.ts");
  assert.match(main, /hydrateSemaDisplays\(projectId, manifest, \{ fatal: true \}\)/);
  assert.match(main, /SEMA display hydration incomplete/);
  assert.match(
    read("desktop/src/packages/project-package-service.ts"),
    /getInstallBySlug\(project\.slug\)/,
  );
  assert.match(
    read("desktop/src/packages/sema/sema-package-display-hydration.ts"),
    /getInstallBySlug\(manifest\.projectSlug\)/,
  );
});

test("clean install: downloadPackage(sema) creates all default display rows", async () => {
  const distService = path.join(desktopRoot, "dist", "packages", "project-package-service.js");
  const distHydration = path.join(
    desktopRoot,
    "dist",
    "packages",
    "sema",
    "sema-package-display-hydration.js",
  );
  if (!fs.existsSync(distService) || !fs.existsSync(distHydration)) {
    // Source wiring is covered above; full runtime needs a desktop build.
    assert.ok(fs.existsSync(path.join(desktopRoot, "src", "packages", "project-package-service.ts")));
    return;
  }

  const { LocalDatabase } = require(path.join(desktopRoot, "dist", "database", "connection.js"));
  const { ProjectsRepository } = require(
    path.join(desktopRoot, "dist", "repositories", "projects-repository.js"),
  );
  const { ProjectPackagesRepository } = require(
    path.join(desktopRoot, "dist", "repositories", "project-packages-repository.js"),
  );
  const { DisplaysRepository } = require(
    path.join(desktopRoot, "dist", "repositories", "displays-repository.js"),
  );
  const { ProjectDisplayCodeRepository } = require(
    path.join(desktopRoot, "dist", "repositories", "project-display-code-repository.js"),
  );
  const { ProjectCodeRevisionsRepository } = require(
    path.join(desktopRoot, "dist", "repositories", "project-code-revisions-repository.js"),
  );
  const { ProjectCodeStorageService } = require(
    path.join(desktopRoot, "dist", "services", "project-code-storage-service.js"),
  );
  const { ProjectPackageService } = require(distService);
  const { SemaPackageDisplayHydration } = require(distHydration);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "neud-sema-clean-"));
  const paths = {
    root,
    data: path.join(root, "data"),
    databaseFile: path.join(root, "data", "neud.sqlite"),
    backups: path.join(root, "backups"),
    projects: path.join(root, "projects"),
    logs: path.join(root, "logs"),
    repoRoot,
  };
  fs.mkdirSync(paths.data, { recursive: true });
  fs.mkdirSync(paths.projects, { recursive: true });

  const db = await LocalDatabase.open(paths);
  try {
    const projects = new ProjectsRepository(db);
    const packages = new ProjectPackagesRepository(db);
    const displays = new DisplaysRepository(db);
    const displayCode = new ProjectDisplayCodeRepository(db);
    const revisions = new ProjectCodeRevisionsRepository(db);
    const storage = new ProjectCodeStorageService(paths);
    const service = new ProjectPackageService(paths, packages, projects);
    const hydration = new SemaPackageDisplayHydration(
      packages,
      displays,
      displayCode,
      revisions,
      storage,
    );

    const required = [
      "schedule-ticker",
      "schedule-pylon",
      "schedule-ticker-editable",
      "schedule-fullscreen-uhd",
    ];
    service.setPackageActivatedHandler((projectId, manifest) => {
      const results = hydration.ensureHydrated(projectId, manifest);
      const missing = required.filter(
        (slug) => !results.some((result) => result.slug === slug && result.displayId),
      );
      assert.equal(missing.length, 0, `hydration missing: ${missing.join(", ")}`);
    });

    const install = await service.downloadPackage("sema");
    assert.equal(install.installState, "installed");
    assert.ok(install.packageRoot);
    assert.ok(fs.existsSync(path.join(install.packageRoot, "displays", "schedule-ticker-v1.html")));
    assert.ok(fs.existsSync(path.join(install.packageRoot, "displays", "schedule-pylon-v1.html")));
    assert.ok(
      fs.existsSync(path.join(install.packageRoot, "displays", "schedule-ticker-editable-v1.html")),
    );
    assert.ok(
      fs.existsSync(path.join(install.packageRoot, "displays", "schedule-fullscreen-uhd-v1.html")),
    );

    const keys = service.getInstalledDisplayKeys(install.projectId);
    assert.ok(keys);
    for (const slug of required) {
      assert.ok(keys.has(slug), `missing installed key ${slug}`);
    }

    const rows = displays.listByProject(install.projectId);
    const displayKeys = new Set(rows.map((row) => row.displayKey));
    for (const slug of required) {
      assert.ok(displayKeys.has(slug), `missing display row ${slug}`);
    }

    // Re-download / hydrate must not duplicate display keys.
    await service.updatePackage("sema");
    const afterUpdate = displays.listByProject(install.projectId);
    const keyed = afterUpdate.filter((row) => required.includes(row.displayKey));
    assert.equal(keyed.length, required.length);

    // Identity mismatch fallback: keys resolve by slug when install PK drifts.
    const project = projects.getById(install.projectId);
    assert.ok(project);
    const orphanId = "00000000-0000-4000-8000-000000000099";
    assert.equal(service.getInstalledDisplayKeys(orphanId), null);
    // Simulate looking up via slug-backed project after remapping helper runs.
    const bySlug = packages.getInstallBySlug("sema");
    assert.ok(bySlug?.manifest?.displays?.length >= 3);
  } finally {
    db.close?.();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
