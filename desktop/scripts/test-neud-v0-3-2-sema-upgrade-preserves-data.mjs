#!/usr/bin/env node
/**
 * Isolated SEMA v9 → v10 upgrade: schedule state + custom display preserved.
 * Uses a temporary NEUD data root — never the Owner's Application Support DB.
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

test("isolated v9 install upgrades to v10 without losing schedule or custom display", async () => {
  const distService = path.join(desktopRoot, "dist", "packages", "project-package-service.js");
  const distHydration = path.join(
    desktopRoot,
    "dist",
    "packages",
    "sema",
    "sema-package-display-hydration.js",
  );
  const distBuilder = path.join(desktopRoot, "dist", "packages", "sema-package-builder.js");
  assert.ok(fs.existsSync(distService), "desktop dist required — run tsc + copy-runtime-assets");

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
  const { buildSemaPackageV1 } = require(distBuilder);
  const catalog = require(path.join(desktopRoot, "dist", "packages", "builtin-package-catalog.js"));

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "neud-sema-upgrade-"));
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
  fs.mkdirSync(paths.logs, { recursive: true });

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
    service.setPackageActivatedHandler((projectId, manifest) => {
      hydration.ensureHydrated(projectId, manifest);
    });

    // Fresh install at current catalog, then surgically rewrite to a v9-shaped package tree.
    const install = await service.downloadPackage("sema");
    assert.equal(install.installState, "installed");

    const projectId = install.projectId;
    const v9Root = path.join(paths.projects, projectId, "packages", "v9");
    fs.mkdirSync(path.join(v9Root, "displays"), { recursive: true });
    // Build current package then strip fullscreen to simulate v9 on disk.
    const staging = fs.mkdtempSync(path.join(os.tmpdir(), "neud-sema-v9-shape-"));
    try {
      const full = buildSemaPackageV1(staging);
      for (const file of ["schedule-ticker-v1.html", "schedule-pylon-v1.html", "schedule-ticker-editable-v1.html"]) {
        fs.copyFileSync(
          path.join(staging, "displays", file),
          path.join(v9Root, "displays", file),
        );
      }
      const logoSrc = path.join(staging, "displays", "assets", "sema-live-autozone-logo.png");
      if (fs.existsSync(logoSrc)) {
        fs.mkdirSync(path.join(v9Root, "displays", "assets"), { recursive: true });
        fs.copyFileSync(logoSrc, path.join(v9Root, "displays", "assets", "sema-live-autozone-logo.png"));
      }
      const v9Manifest = {
        ...full,
        packageVersion: 9,
        displays: full.displays.filter((d) => d.slug !== "schedule-fullscreen-uhd"),
      };
      fs.writeFileSync(path.join(v9Root, "manifest.json"), `${JSON.stringify(v9Manifest, null, 2)}\n`);

      // Remove fullscreen display row if hydration already created it from first download.
      const existingFullscreen = displays
        .listByProject(projectId)
        .find((row) => row.displayKey === "schedule-fullscreen-uhd");
      if (existingFullscreen) {
        displays.softDelete?.(existingFullscreen.id);
        // Fallback: wipe via raw if softDelete unavailable — use delete by re-list filter expectation after upgrade.
        db.prepare?.(`DELETE FROM displays WHERE id = ?`)?.run(existingFullscreen.id);
        db.prepare?.(`DELETE FROM project_display_code WHERE display_id = ?`)?.run(
          existingFullscreen.id,
        );
      }

      // Seed schedule state (config preservation).
      db.prepare(
        `INSERT OR REPLACE INTO sema_schedule_state (
          project_id, source_mode, rows_json, current_index, selection_seq, state_revision,
          sheet_spreadsheet_id, sheet_worksheet_gid, sheet_worksheet_title, poll_interval_ms,
          updated_at, viewing_rows_json
        ) VALUES (?, 'google-sheets', ?, 2, 7, 3, 'sheet-abc', 'gid-1', 'DAY 1', 15000, ?, '[]')`,
      ).run(
        projectId,
        JSON.stringify([
          { title: "A", description: "1" },
          { title: "B", description: "2" },
          { title: "C", description: "3" },
        ]),
        new Date().toISOString(),
      );

      // Custom operator display (must survive package update).
      const custom = displays.upsert({
        projectId,
        name: "Operator Custom Lower Third",
        displayKey: "operator-custom-lower-third",
        htmlPath: null,
        enabled: true,
        refreshRateMs: 5000,
        displayWidth: 1920,
        displayHeight: 1080,
        settings: { sourceType: "project-html", custom: true },
      });
      assert.ok(custom?.id);

      packages.upsertInstall({
        ...packages.getInstallByProjectId(projectId),
        packageRoot: v9Root,
        installedVersion: 9,
        availableVersion: catalog.SEMA_PACKAGE_BASELINE_VERSION,
        previousVersion: 8,
        installState: "installed",
        manifest: v9Manifest,
        updatedAt: new Date().toISOString(),
      });

      const beforeCustom = displays
        .listByProject(projectId)
        .filter((row) => row.displayKey === "operator-custom-lower-third");
      assert.equal(beforeCustom.length, 1);

      const updated = await service.updatePackage("sema");
      assert.equal(updated.installedVersion, catalog.SEMA_PACKAGE_BASELINE_VERSION);
      assert.equal(updated.installState, "installed");

      const rows = displays.listByProject(projectId);
      const keys = rows.map((row) => row.displayKey);
      for (const slug of [
        "schedule-ticker",
        "schedule-pylon",
        "schedule-ticker-editable",
        "schedule-fullscreen-uhd",
        "operator-custom-lower-third",
      ]) {
        assert.equal(keys.filter((k) => k === slug).length, 1, `expected single ${slug}`);
      }

      const fullscreen = rows.find((row) => row.displayKey === "schedule-fullscreen-uhd");
      assert.equal(fullscreen.displayWidth, 3840);
      assert.equal(fullscreen.displayHeight, 2160);
      const published = storage.readDisplayPublished(projectId, fullscreen.id);
      assert.ok(published?.html?.includes('data-display="schedule-fullscreen-uhd"'));

      const schedule = db
        .prepare(
          `SELECT source_mode, current_index, selection_seq, sheet_spreadsheet_id, sheet_worksheet_title
           FROM sema_schedule_state WHERE project_id = ?`,
        )
        .get(projectId);
      assert.equal(schedule.source_mode, "google-sheets");
      assert.equal(schedule.current_index, 2);
      assert.equal(schedule.selection_seq, 7);
      assert.equal(schedule.sheet_spreadsheet_id, "sheet-abc");
      assert.equal(schedule.sheet_worksheet_title, "DAY 1");

      assert.ok(fs.existsSync(path.join(updated.packageRoot, "displays", "assets", "sema-live-autozone-logo.png")));
    } finally {
      fs.rmSync(staging, { recursive: true, force: true });
    }
  } finally {
    db.close?.();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
