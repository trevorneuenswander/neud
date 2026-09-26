#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { buildDisplayViewerLookupDiagnostic } from "../dist/lib/display-viewer-lookup-diagnostic.js";
import {
  readPublishedDisplayBundleForOutput,
  reconcilePublishedDisplayContent,
} from "../dist/lib/reconcile-published-display-content.js";
import { ProjectCodeStorageService } from "../dist/services/project-code-storage-service.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function createStoragePaths(name) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const root = path.join(process.cwd(), `.tmp-display-hydration-${name}-${suffix}`);
  const paths = {
    root,
    data: path.join(root, "data"),
    projects: path.join(root, "projects"),
    repoRoot,
  };
  fs.mkdirSync(paths.projects, { recursive: true });
  return paths;
}

test("reconcile copies exact published revision bundle into current/", () => {
  const paths = createStoragePaths("repair");
  const storage = new ProjectCodeStorageService(paths);
  const projectId = crypto.randomUUID();
  const displayId = crypto.randomUUID();
  const revisionId = crypto.randomUUID();
  const bundle = {
    html: "<html><body>Stream Ticker</body></html>",
    css: ".ticker {}",
    javascript: "console.log('ticker');",
    metadata: { revisionName: "v3" },
  };

  storage.writeDisplayRevision(projectId, displayId, revisionId, bundle);

  const result = reconcilePublishedDisplayContent({
    projectId,
    displayId,
    publishedRevisionId: revisionId,
    storage,
    now: () => "2026-01-01T00:00:00.000Z",
  });

  assert.equal(result.status, "repaired");
  const published = storage.readDisplayPublished(projectId, displayId);
  assert.ok(published?.html.includes("Stream Ticker"));
  assert.equal(published.metadata.revisionId, revisionId);
  assert.equal(published.metadata.hydratedFromRevision, true);
});

test("output resolver hydrates and serves published revision without draft fallback", () => {
  const paths = createStoragePaths("output");
  const storage = new ProjectCodeStorageService(paths);
  const projectId = crypto.randomUUID();
  const displayId = crypto.randomUUID();
  const revisionId = crypto.randomUUID();

  storage.writeDisplayRevision(projectId, displayId, revisionId, {
    html: "<html><body>Published</body></html>",
    css: "",
    javascript: "",
    metadata: {},
  });

  const served = readPublishedDisplayBundleForOutput({
    projectId,
    displayId,
    publishedRevisionId: revisionId,
    storage,
  });

  assert.ok(served?.html.includes("Published"));
  assert.ok(storage.readDisplayPublished(projectId, displayId)?.html.includes("Published"));
});

test("output resolver does not use draft when published revision pointer is set", () => {
  const paths = createStoragePaths("no-draft");
  const storage = new ProjectCodeStorageService(paths);
  const projectId = crypto.randomUUID();
  const displayId = crypto.randomUUID();
  const revisionId = crypto.randomUUID();

  storage.writeDisplayRevision(projectId, displayId, revisionId, {
    html: "<html><body>Published revision</body></html>",
    css: "",
    javascript: "",
    metadata: {},
  });

  const served = readPublishedDisplayBundleForOutput({
    projectId,
    displayId,
    publishedRevisionId: revisionId,
    storage,
  });

  assert.ok(served?.html.includes("Published revision"));
  assert.doesNotMatch(served.html, /draft-only/);
});

test("diagnostic published_content_missing state becomes ok after hydration", () => {
  const paths = createStoragePaths("diagnostic");
  const storage = new ProjectCodeStorageService(paths);
  const projectId = "8526be86-4f8a-4522-8506-efa8a25fe903";
  const displayId = "ab04306e-d9fd-4bcb-8991-78aab81f564d";
  const revisionId = "b9918d0b-b429-465c-ab0f-3df2a910c39d";

  storage.writeDisplayRevision(projectId, displayId, revisionId, {
    html: "<html><body>Stream Ticker Output</body></html>",
    css: "",
    javascript: "",
    metadata: {},
  });

  reconcilePublishedDisplayContent({
    projectId,
    displayId,
    publishedRevisionId: revisionId,
    storage,
  });

  const diagnostic = buildDisplayViewerLookupDiagnostic({
    routeProjectSegment: projectId,
    routeDisplaySlug: "stream-ticker",
    previewMode: false,
    projects: {
      getById: (id) => ({ id, slug: "broad-arrow-auctions" }),
      getBySlug: () => null,
      list: () => [{ id: projectId, slug: "broad-arrow-auctions" }],
    },
    displayCode: {
      getBySlug: () => ({
        displayId,
        projectId,
        slug: "stream-ticker",
        publishedRevisionId: revisionId,
        draftHtml: "<html>draft</html>",
      }),
    },
    displays: {
      getById: () => ({
        id: displayId,
        projectId,
        displayKey: "stream-ticker",
      }),
    },
    displaySyncHooks: {},
    storage,
  });

  assert.equal(diagnostic.stage, "ok");
  assert.equal(diagnostic.hasPublishedBundle, true);
  assert.equal(diagnostic.hasRevisionBundle, true);
});

test("developer tools and cloud pull wire published display hydration", () => {
  const developerTools = read("desktop/src/services/developer-tools-service.ts");
  const syncPull = read("desktop/src/services/display-sync/display-sync-pull.ts");
  const main = read("desktop/src/main.ts");

  assert.match(developerTools, /readPublishedDisplayBundleForOutput/);
  assert.match(developerTools, /reconcilePublishedDisplayContentForProject/);
  assert.match(syncPull, /hydratePublishedDisplayBundleFromActiveRevision/);
  assert.match(main, /reconcilePublishedDisplayContentForProject/);
});
