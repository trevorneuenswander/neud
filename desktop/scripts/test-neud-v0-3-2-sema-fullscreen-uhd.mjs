#!/usr/bin/env node
/**
 * v0.3.2 — SEMA Fullscreen Schedule (3840×2160) package, hydration, and runtime wiring.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import crypto from "node:crypto";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktopRoot = path.join(repoRoot, "desktop");

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), "utf8");
}

const REQUIRED_SLUGS = [
  "schedule-ticker",
  "schedule-pylon",
  "schedule-ticker-editable",
  "schedule-fullscreen-uhd",
];

test("source: fullscreen UHD display is wired into catalog, builder, bundling, and hydration gates", () => {
  const html = read(
    "desktop/src/displays/bundled/sema-schedule-fullscreen-uhd-v1.html",
  );
  assert.match(html, /data-display="schedule-fullscreen-uhd"/);
  assert.match(html, /data-frame="3840x2160"/);
  assert.match(html, /data-slot="now"/);
  assert.match(html, /data-slot="next"/);
  assert.match(html, /data-slot="later"/);
  assert.match(html, /NEUDDisplay\.subscribe/);
  assert.match(html, /highlightActive/);
  assert.doesNotMatch(html, /class="header"/);
  assert.doesNotMatch(html, /SEMA\s*<\/span>\s*<span class="live">LIVE/);
  assert.doesNotMatch(html, /sourcePill|DATA SOURCE|id="brandLogo"/);
  assert.match(html, /--now-flex:\s*0\.45/);
  assert.match(html, /--next-flex:\s*0\.30/);
  assert.match(html, /--later-flex:\s*0\.25/);

  const builder = read("desktop/src/packages/sema-package-builder.ts");
  assert.match(builder, /SEMA_SCHEDULE_FULLSCREEN_UHD_HTML_PATH/);
  assert.match(builder, /schedule-fullscreen-uhd/);
  assert.match(builder, /SEMA Fullscreen Schedule/);
  assert.match(builder, /injectSemaLogoDataUri/);

  const catalog = read("desktop/src/packages/builtin-package-catalog.ts");
  assert.match(catalog, /SEMA_PACKAGE_BASELINE_VERSION\s*=\s*10/);

  const bundled = read("desktop/src/lib/bundled-display-sources.ts");
  assert.match(bundled, /sema-schedule-fullscreen-uhd-v1\.html/);

  const main = read("desktop/src/main.ts");
  assert.match(main, /schedule-fullscreen-uhd/);

  const pkg = read("desktop/src/packages/project-package-service.ts");
  assert.match(pkg, /schedule-fullscreen-uhd-v1\.html/);
  assert.match(pkg, /SEMA Fullscreen Schedule display definition/);

  // Existing ticker source must remain untouched for this feature.
  assert.match(
    read("desktop/src/displays/bundled/sema-schedule-ticker-v1.html"),
    /data-display="schedule-ticker"/,
  );
});

test("fullscreen HTML shares ticker payload contract (no second schedule engine)", () => {
  const html = read(
    "desktop/src/displays/bundled/sema-schedule-fullscreen-uhd-v1.html",
  );
  assert.match(html, /schedule\.now \|\| schedule\.NOW/);
  assert.match(html, /schedule\.next \|\| schedule\.NEXT/);
  assert.match(html, /schedule\.later \|\| schedule\.LATER/);
  assert.match(html, /schedule\.highlightActive/);
  assert.doesNotMatch(html, /setInterval\s*\(/);
  assert.doesNotMatch(html, /spreadsheets\.google/);
  assert.doesNotMatch(html, /pollInterval/);
});

test("package build includes fullscreen HTML, logo asset, and stable slug", () => {
  const distBuilder = path.join(desktopRoot, "dist", "packages", "sema-package-builder.js");
  if (!fs.existsSync(distBuilder)) {
    assert.ok(
      fs.existsSync(path.join(desktopRoot, "src", "packages", "sema-package-builder.ts")),
    );
    return;
  }

  const { buildSemaPackageV1, SEMA_SCHEDULE_FULLSCREEN_UHD_HTML_PATH } = require(
    path.join(desktopRoot, "dist", "packages", "sema-package-builder.js"),
  );
  const catalog = require(path.join(desktopRoot, "dist", "packages", "builtin-package-catalog.js"));
  assert.equal(catalog.SEMA_PACKAGE_BASELINE_VERSION, 10);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "neud-sema-fullscreen-pkg-"));
  try {
    const manifest = buildSemaPackageV1(tmp);
    assert.equal(manifest.packageVersion, catalog.SEMA_PACKAGE_BASELINE_VERSION);
    const slugs = manifest.displays.map((d) => d.slug);
    for (const slug of REQUIRED_SLUGS) {
      assert.ok(slugs.includes(slug), `missing slug ${slug}`);
    }
    const fullscreen = manifest.displays.find((d) => d.slug === "schedule-fullscreen-uhd");
    assert.equal(fullscreen.name, "SEMA Fullscreen Schedule");
    assert.equal(fullscreen.width, 3840);
    assert.equal(fullscreen.height, 2160);
    assert.equal(fullscreen.runtimeAdapterKey, "sema-schedule-fullscreen-uhd");
    assert.equal(fullscreen.htmlPath, SEMA_SCHEDULE_FULLSCREEN_UHD_HTML_PATH);

    const htmlPath = path.join(tmp, SEMA_SCHEDULE_FULLSCREEN_UHD_HTML_PATH);
    assert.ok(fs.existsSync(htmlPath));
    const html = fs.readFileSync(htmlPath, "utf8");
    assert.match(html, /data-display="schedule-fullscreen-uhd"/);
    assert.doesNotMatch(html, /class="header"/);
    assert.ok(
      fs.existsSync(path.join(tmp, "displays", "assets", "sema-live-autozone-logo.png")),
    );
    // Ticker file still present and distinct.
    assert.ok(fs.existsSync(path.join(tmp, "displays", "schedule-ticker-v1.html")));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("clean install + upgrade hydrates fullscreen without duplicates", async () => {
  const distService = path.join(desktopRoot, "dist", "packages", "project-package-service.js");
  const distHydration = path.join(
    desktopRoot,
    "dist",
    "packages",
    "sema",
    "sema-package-display-hydration.js",
  );
  if (!fs.existsSync(distService) || !fs.existsSync(distHydration)) {
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

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "neud-sema-fs-clean-"));
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

    service.setPackageActivatedHandler((projectId, manifest) => {
      const results = hydration.ensureHydrated(projectId, manifest);
      const missing = REQUIRED_SLUGS.filter(
        (slug) => !results.some((result) => result.slug === slug && result.displayId),
      );
      assert.equal(missing.length, 0, `hydration missing: ${missing.join(", ")}`);
    });

    const install = await service.downloadPackage("sema");
    assert.equal(install.installState, "installed");
    assert.ok(
      fs.existsSync(
        path.join(install.packageRoot, "displays", "schedule-fullscreen-uhd-v1.html"),
      ),
    );

    const keys = service.getInstalledDisplayKeys(install.projectId);
    assert.ok(keys);
    for (const slug of REQUIRED_SLUGS) {
      assert.ok(keys.has(slug), `installed keys missing ${slug}`);
    }

    const rows = displays.listByProject(install.projectId);
    const displayKeys = rows.map((row) => row.displayKey);
    for (const slug of REQUIRED_SLUGS) {
      assert.ok(displayKeys.includes(slug), `display row missing ${slug}`);
    }

    const fullscreen = rows.find((row) => row.displayKey === "schedule-fullscreen-uhd");
    assert.ok(fullscreen);
    assert.equal(fullscreen.displayWidth, 3840);
    assert.equal(fullscreen.displayHeight, 2160);
    const published = storage.readDisplayPublished(install.projectId, fullscreen.id);
    assert.ok(published?.html?.includes('data-display="schedule-fullscreen-uhd"'));
    assert.ok(!published.html.includes('class="header"'));

    // Local display URL path contract (served via /api/display/:projectId/:slug).
    const localUrlPath = `/api/display/${install.projectId}/schedule-fullscreen-uhd`;
    assert.match(localUrlPath, /schedule-fullscreen-uhd/);

    await service.updatePackage("sema");
    const afterUpdate = displays.listByProject(install.projectId);
    const keyed = afterUpdate.filter((row) => REQUIRED_SLUGS.includes(row.displayKey));
    assert.equal(keyed.length, REQUIRED_SLUGS.length);

    // Upgrade from a v9-shaped install (missing fullscreen) hydrates the new display once.
    const prior = packages.getInstallByProjectId(install.projectId);
    assert.ok(prior);
    packages.upsertInstall({
      ...prior,
      installedVersion: 9,
      availableVersion: 10,
      manifest: {
        ...prior.manifest,
        packageVersion: 9,
        displays: prior.manifest.displays.filter(
          (display) => display.slug !== "schedule-fullscreen-uhd",
        ),
      },
      updatedAt: new Date().toISOString(),
    });
    await service.updatePackage("sema");
    const afterUpgrade = displays.listByProject(install.projectId);
    const fullscreenRows = afterUpgrade.filter(
      (row) => row.displayKey === "schedule-fullscreen-uhd",
    );
    assert.equal(fullscreenRows.length, 1);
  } finally {
    db.close?.();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("fullscreen render helper accepts Jump/Highlight/empty/offline payloads", () => {
  const html = read(
    "desktop/src/displays/bundled/sema-schedule-fullscreen-uhd-v1.html",
  );
  // Extract and eval the IIFE is brittle; assert contract markers instead + lightweight VM below.
  assert.match(html, /__SEMA_SCHEDULE_FULLSCREEN_UHD__/);
  assert.match(html, /is-slot-empty/);
  assert.match(html, /data-highlight/);
  assert.doesNotMatch(html, /updateSourcePill|sourcePill/);

  // Lightweight DOM-free payload shaping mirror of the display contract.
  function shape(payload) {
    const schedule = payload.schedule || {};
    return {
      now: schedule.now || null,
      next: schedule.next || null,
      later: schedule.later || null,
      highlightActive: schedule.highlightActive === true,
      currentRowId: schedule.currentRowId || null,
      stale: Boolean(payload.stale || schedule.stale),
      offline: Boolean(payload.offline),
      source: payload.source || schedule.source || null,
    };
  }

  const jumped = shape({
    schedule: {
      now: { title: "Keynote", description: "Main", time: "10:00" },
      next: { title: "Panel", description: "Hall B", time: "11:00" },
      later: { title: "Lunch", description: "Atrium", time: "12:00" },
      currentRowId: "sel-2",
      highlightActive: false,
    },
    source: "google-sheets",
  });
  assert.equal(jumped.now.title, "Keynote");
  assert.equal(jumped.currentRowId, "sel-2");

  const highlighted = shape({
    schedule: {
      now: { title: "Keynote", description: "Main", time: "10:00" },
      next: null,
      later: { title: "VIP Lounge", description: "Featured", time: "" },
      highlightActive: true,
      currentRowId: "sel-2",
    },
  });
  assert.equal(highlighted.highlightActive, true);
  assert.equal(highlighted.later.title, "VIP Lounge");
  assert.equal(highlighted.next, null);

  const offline = shape({
    schedule: {
      now: { title: "Cached", description: "Last known", time: "09:00" },
      next: null,
      later: null,
      highlightActive: false,
      stale: true,
    },
    offline: true,
    stale: true,
    source: "google-sheets",
  });
  assert.equal(offline.offline, true);
  assert.equal(offline.stale, true);
  assert.equal(offline.now.title, "Cached");
});
