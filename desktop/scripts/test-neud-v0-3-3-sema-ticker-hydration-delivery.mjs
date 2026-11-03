/**
 * v0.3.3 — Prove the Owner-visible SEMA Ticker highlight bug was a revision
 * delivery miss: published intermediate HTML (bede95a1) lacked fitField no-op,
 * and safe-upgrade previously refused to replace it.
 *
 * BrowserWindow tests that load bundled HTML directly passed while the live
 * NEUD app kept serving the stuck published revision.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const desktopRoot = path.join(repoRoot, "desktop");
const BUNDLED_TICKER = "desktop/src/displays/bundled/sema-schedule-ticker-v1.html";
const INTERMEDIATE_FIXTURE =
  "desktop/scripts/fixtures/sema-schedule-ticker-intermediate-bede95a1.html";
const INTERMEDIATE_HASH =
  "bede95a1314ba30531340e5757aa2d35da9220adb3a80ed10d171ff6c536edd6";
const V032_HASH = "9a86a7fb874f4aaae16a4520c754856ec72c556b42742a32948b9168a474449e";

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), "utf8");
}

function hashRuntimeDisplayBundle(html) {
  const normalized = html.replace(/\r\n/g, "\n").trimEnd();
  return crypto.createHash("sha256").update(`${normalized}\n\n\n`).digest("hex");
}

test("intermediate fixture is the Owner-stuck revision without fitField no-op", () => {
  const intermediate = read(INTERMEDIATE_FIXTURE);
  assert.equal(hashRuntimeDisplayBundle(intermediate), INTERMEDIATE_HASH);
  assert.match(intermediate, /var TITLE_BASE = 57/);
  assert.match(intermediate, /var MARQUEE_PX_PER_SEC = 40/);
  assert.match(intermediate, /highlightToggled/);
  // Critical gap that restarts marquees on remasure:
  assert.match(intermediate, /function fitField\(field, slot, value\) \{\s*var kind/);
  assert.match(intermediate, /stopMarquee\(field\);\s*clearTrackExtras\(track\);/);
  assert.doesNotMatch(intermediate, /marqueeIsActive\(field\)/);
  assert.doesNotMatch(intermediate, /options\.force === true/);
  assert.doesNotMatch(intermediate, /sema-ticker-v0\.3\.3-hl-stable-1/);
});

test("bundled ticker has highlight-stable fitField and build marker", () => {
  const bundled = read(BUNDLED_TICKER);
  assert.notEqual(hashRuntimeDisplayBundle(bundled), INTERMEDIATE_HASH);
  assert.match(bundled, /sema-ticker-v0\.3\.3-hl-stable-1/);
  assert.match(bundled, /prev\.mode === "marquee" && marqueeIsActive\(field\)/);
  assert.match(bundled, /options\.force === true/);
  assert.match(bundled, /getBuildInfo/);
});

test("safe-upgrade allowlist includes v0.3.2 and the stuck intermediate hash", () => {
  const hydration = read("desktop/src/packages/sema/sema-package-display-hydration.ts");
  assert.match(hydration, new RegExp(V032_HASH));
  assert.match(hydration, new RegExp(INTERMEDIATE_HASH));
  assert.match(
    hydration,
    /SEMA_SCHEDULE_TICKER_PREVIOUS_PACKAGED_SOURCE_HASHES[\s\S]*bede95a1314ba30531340e5757aa2d35da9220adb3a80ed10d171ff6c536edd6/,
  );
});

test("hydration upgrades published intermediate ticker to current bundled HTML", async () => {
  const distHydration = path.join(
    desktopRoot,
    "dist",
    "packages",
    "sema",
    "sema-package-display-hydration.js",
  );
  if (!fs.existsSync(distHydration)) {
    assert.ok(
      fs.existsSync(path.join(desktopRoot, "src", "packages", "sema", "sema-package-display-hydration.ts")),
    );
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
  const {
    SemaPackageDisplayHydration,
    SEMA_SCHEDULE_TICKER_PREVIOUS_PACKAGED_SOURCE_HASHES,
  } = require(distHydration);
  const { createRevisionId } = require(
    path.join(desktopRoot, "dist", "repositories", "project-scraper-code-repository.js"),
  );

  assert.equal(
    SEMA_SCHEDULE_TICKER_PREVIOUS_PACKAGED_SOURCE_HASHES.has(INTERMEDIATE_HASH),
    true,
  );

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "neud-sema-ticker-delivery-"));
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

  const packageRoot = path.join(root, "package");
  const displaysDir = path.join(packageRoot, "displays");
  fs.mkdirSync(displaysDir, { recursive: true });
  const currentHtml = read(BUNDLED_TICKER);
  const currentHash = hashRuntimeDisplayBundle(currentHtml);
  fs.writeFileSync(path.join(displaysDir, "schedule-ticker-v1.html"), currentHtml);
  // Minimal stubs so ensureHydrated can iterate the full SEMA display set if needed.
  for (const name of [
    "schedule-pylon-v1.html",
    "schedule-ticker-editable-v1.html",
    "schedule-fullscreen-uhd-v1.html",
  ]) {
    fs.writeFileSync(path.join(displaysDir, name), "<!DOCTYPE html><html><body></body></html>\n");
  }

  const db = await LocalDatabase.open(paths);
  try {
    const projects = new ProjectsRepository(db);
    const packages = new ProjectPackagesRepository(db);
    const displays = new DisplaysRepository(db);
    const displayCode = new ProjectDisplayCodeRepository(db);
    const revisions = new ProjectCodeRevisionsRepository(db);
    const storage = new ProjectCodeStorageService(paths);
    const hydration = new SemaPackageDisplayHydration(
      packages,
      displays,
      displayCode,
      revisions,
      storage,
    );

    const project = projects.create({
      name: "SEMA",
      slug: "sema",
      projectType: "sema",
    });
    const tickerDefinition = {
      slug: "schedule-ticker",
      name: "Schedule Ticker",
      htmlPath: "displays/schedule-ticker-v1.html",
      width: 3840,
      height: 2160,
    };
    const manifest = {
      projectSlug: "sema",
      displays: [tickerDefinition],
    };
    packages.upsertInstall({
      projectId: project.id,
      projectSlug: "sema",
      projectType: "sema",
      packageRoot,
      installedVersion: 10,
      availableVersion: 10,
      installState: "installed",
      updatedAt: new Date().toISOString(),
      manifest,
    });

    const display = displays.upsert({
      projectId: project.id,
      name: "Schedule Ticker",
      displayKey: "schedule-ticker",
      htmlPath: null,
      enabled: true,
      refreshRateMs: 5000,
      displayWidth: 3840,
      displayHeight: 2160,
      settings: {
        sourceType: "project-html",
        template: "uploaded-html",
        standaloneDocument: true,
        importKey: "sema-schedule-ticker",
        graphicType: "schedule-ticker",
        runtimeAdapterKey: "sema-schedule",
      },
    });

    const intermediateHtml = read(INTERMEDIATE_FIXTURE);
    const revisionId = createRevisionId();
    storage.writeDisplayRevision(project.id, display.id, revisionId, {
      html: intermediateHtml,
      css: "",
      javascript: "",
      metadata: { standaloneDocument: true, importKey: "sema-schedule-ticker" },
    });
    storage.writeDisplayPublished(project.id, display.id, {
      html: intermediateHtml,
      css: "",
      javascript: "",
      metadata: { standaloneDocument: true, importKey: "sema-schedule-ticker" },
    });
    displayCode.upsert({
      projectId: project.id,
      displayId: display.id,
      slug: "schedule-ticker",
      sourceType: "project-html",
      publishedRevisionId: revisionId,
      updatedBy: "system",
    });
    revisions.create({
      id: revisionId,
      projectId: project.id,
      resourceType: "display",
      resourceId: display.id,
      createdBy: "system",
      changeNote: "Intermediate v0.3.3-dev ticker",
      sourceHash: INTERMEDIATE_HASH,
      versionNumber: 19,
    });

    const before = storage.readDisplayPublished(project.id, display.id);
    assert.equal(hashRuntimeDisplayBundle(before.html), INTERMEDIATE_HASH);

    const results = hydration.ensureHydrated(project.id, manifest);

    const tickerResult = results.find((entry) => entry.slug === "schedule-ticker");
    assert.ok(tickerResult);
    assert.equal(tickerResult.revisionPublished, true, JSON.stringify(tickerResult));
    assert.match(String(tickerResult.reason || ""), /Upgraded from prior packaged/);

    const after = storage.readDisplayPublished(project.id, display.id);
    assert.equal(hashRuntimeDisplayBundle(after.html), currentHash);
    assert.match(after.html, /sema-ticker-v0\.3\.3-hl-stable-1/);
    assert.match(after.html, /prev\.mode === "marquee" && marqueeIsActive\(field\)/);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
