#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { openLocalDatabase, closeLocalDatabase } from "../dist/database/connection.js";
import { ProjectsRepository } from "../dist/repositories/projects-repository.js";
import { DisplaysRepository } from "../dist/repositories/displays-repository.js";
import { ProjectDisplayCodeRepository } from "../dist/repositories/project-display-code-repository.js";
import { ProjectCodeRevisionsRepository } from "../dist/repositories/project-code-revisions-repository.js";
import { ProjectCodeStorageService } from "../dist/services/project-code-storage-service.js";
import { hashDisplayHtml } from "../dist/services/display-sync/cloud-display-mapper.js";
import { buildDisplayViewerLookupDiagnostic } from "../dist/lib/display-viewer-lookup-diagnostic.js";
import { readPublishedDisplayBundleForOutput } from "../dist/lib/reconcile-published-display-content.js";
import {
  buildProvenBundledRevisionBundle,
  recoverFreshInstallPublishedRevision,
} from "../dist/services/display-sync/published-revision-content-recovery.js";
import { hashBundledDisplayContentIdentity } from "../dist/displays/display-source-content-hash.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function createPaths(name) {
  const root = path.join(process.cwd(), `.tmp-fresh-hydration-${name}-${crypto.randomUUID().slice(0, 8)}`);
  const paths = {
    root,
    data: path.join(root, "data"),
    databaseFile: path.join(root, "data", "test.sqlite"),
    projects: path.join(root, "projects"),
    repoRoot,
  };
  fs.mkdirSync(paths.data, { recursive: true });
  fs.mkdirSync(paths.projects, { recursive: true });
  return paths;
}

function cloudRevision(input) {
  return {
    id: input.id,
    display_id: input.displayId,
    project_id: input.projectId,
    version_number: input.versionNumber ?? 4,
    html_content: input.html,
    content_hash: hashDisplayHtml(input.html),
    version_note: "published",
    created_at: "2026-09-30T12:00:00.000Z",
    created_by_user_id: null,
    restored_from_revision_id: null,
    sync_version: 1,
    source_instance_id: "11111111-1111-4111-8111-111111111111",
  };
}

async function seedBrokenDisplay(paths, spec) {
  const db = await openLocalDatabase(paths);
  const projects = new ProjectsRepository(db);
  const displays = new DisplaysRepository(db);
  const displayCode = new ProjectDisplayCodeRepository(db);
  const revisions = new ProjectCodeRevisionsRepository(db);
  const storage = new ProjectCodeStorageService(paths);
  const project = projects.create({
    name: "Broad Arrow Auctions",
    slug: `broad-arrow-${spec.slug}`,
    projectType: "bag-graphics",
  });
  const display = displays.insertFromCloud({
    id: crypto.randomUUID(),
    projectId: project.id,
    name: spec.name,
    displayKey: spec.slug,
    enabled: true,
  });
  revisions.create({
    id: spec.localRevisionId,
    projectId: project.id,
    resourceType: "display",
    resourceId: display.id,
    sourceHash: spec.sourceHash,
    validationStatus: "valid",
    createdBy: "system",
    message: "seed",
    metadata: spec.metadata ?? { seeded: true, importKey: spec.importKey },
  });
  displayCode.upsert({
    displayId: display.id,
    projectId: project.id,
    slug: spec.slug,
    draftHtml: "DRAFT-ONLY",
    publishedRevisionId: spec.localRevisionId,
    sourceType: "project-html",
  });
  return { db, projects, displays, displayCode, revisions, storage, project, display };
}

const OUTPUT_MODES = ["preview", "local-url", "pin", "fullscreen"];

function bundleForMode(storage, projectId, displayId, revisionId, mode) {
  if (mode === "preview") {
    const published = storage.readDisplayPublished(projectId, displayId);
    if (published?.html?.trim()) {
      return published;
    }
  }
  return readPublishedDisplayBundleForOutput({
    projectId,
    displayId,
    publishedRevisionId: revisionId,
    storage,
  });
}

test("fresh install downloads the exact cloud revision when the local pointer has no bundle", async () => {
  const cases = [
    {
      slug: "stream-bid-display",
      name: "Stream Bid Display",
      importKey: "broad-arrow:stream-bid-display:v1",
      marker: "CLOUD-PUBLISHED-BID",
    },
    {
      slug: "stream-ticker",
      name: "Stream Ticker",
      importKey: "broad-arrow:stream-ticker:v1",
      marker: "CLOUD-PUBLISHED-TICKER",
    },
  ];

  for (const spec of cases) {
    const paths = createPaths(spec.slug);
    const localRevisionId = "7ff94456-a9b6-4e3b-b90f-a80c90398c1a";
    const cloudRevisionId = crypto.randomUUID();
    const seeded = await seedBrokenDisplay(paths, {
      ...spec,
      localRevisionId,
      sourceHash: "seed-hash",
    });
    const html = `<html><body>${spec.marker}</body></html>`;
    const row = cloudRevision({
      id: cloudRevisionId,
      displayId: seeded.display.id,
      projectId: seeded.project.id,
      html,
    });

    const before = buildDisplayViewerLookupDiagnostic({
      routeProjectSegment: seeded.project.id,
      routeDisplaySlug: spec.slug,
      previewMode: false,
      projects: seeded.projects,
      displayCode: seeded.displayCode,
      displays: seeded.displays,
      displaySyncHooks: {},
      storage: seeded.storage,
      revisionMetadataExists: (revisionId) => Boolean(seeded.revisions.getById(revisionId)),
    });
    assert.equal(before.stage, "published_revision_content_missing");
    assert.equal(before.publishedRevisionId, localRevisionId);
    assert.equal(before.hasPublishedBundle, false);
    assert.equal(before.hasRevisionBundle, false);
    assert.equal(before.hasDraftHtml, true);

    const result = await recoverFreshInstallPublishedRevision({
      projectId: seeded.project.id,
      displayId: seeded.display.id,
      slug: spec.slug,
      localPublishedRevisionId: localRevisionId,
      cloudPublishedRevisionId: cloudRevisionId,
      knownCloudRevision: null,
      fetchRevisionById: async (revisionId) => (revisionId === cloudRevisionId ? row : null),
      revisions: seeded.revisions,
      displayCode: seeded.displayCode,
      storage: seeded.storage,
      actorUserId: "cloud-sync",
      pendingLocalActiveRevisionPush: true,
      localDisplaySyncPending: true,
    });

    assert.equal(result.status, "cloud_revision_restored");
    assert.equal(result.publishedRevisionId, cloudRevisionId);
    assert.ok(seeded.storage.readDisplayRevision(seeded.project.id, seeded.display.id, cloudRevisionId)?.html.includes(spec.marker));
    assert.ok(seeded.storage.readDisplayPublished(seeded.project.id, seeded.display.id)?.html.includes(spec.marker));
    for (const mode of OUTPUT_MODES) {
      const served = bundleForMode(
        seeded.storage,
        seeded.project.id,
        seeded.display.id,
        result.publishedRevisionId,
        mode,
      );
      assert.ok(served?.html.includes(spec.marker), `${spec.slug} ${mode}`);
      assert.doesNotMatch(served.html, /DRAFT-ONLY/);
    }
    await closeLocalDatabase(seeded.db);
    fs.rmSync(paths.root, { recursive: true, force: true });
  }
});

test("quail restores proven bundled identity when the cloud pointer has no body", async () => {
  const paths = createPaths("quail");
  const localRevisionId = crypto.randomUUID();
  const danglingCloudId = crypto.randomUUID();
  const importKey = "broad-arrow:led-display-quail:v1";
  const bundledHtml = "<html>quail-canonical</html>";
  const sourceHash = hashBundledDisplayContentIdentity({ importKey, bundledHtml });
  const seeded = await seedBrokenDisplay(paths, {
    slug: "led-display-quail",
    name: "LED Display (Quail)",
    importKey,
    localRevisionId,
    sourceHash,
  });

  const result = await recoverFreshInstallPublishedRevision({
    projectId: seeded.project.id,
    displayId: seeded.display.id,
    slug: "led-display-quail",
    localPublishedRevisionId: localRevisionId,
    cloudPublishedRevisionId: danglingCloudId,
    knownCloudRevision: null,
    fetchRevisionById: async () => null,
    revisions: seeded.revisions,
    displayCode: seeded.displayCode,
    storage: seeded.storage,
    actorUserId: "cloud-sync",
    pendingLocalActiveRevisionPush: false,
    localDisplaySyncPending: false,
    restoreProvenBundledRevision: (revisionId) => {
      const revision = seeded.revisions.getById(revisionId);
      return buildProvenBundledRevisionBundle({
        slug: "led-display-quail",
        revisionId,
        importKey: revision?.metadata?.importKey ?? null,
        sourceHash: revision?.sourceHash ?? null,
        bundledHtml,
        runtimeHtml: "<html>QUAIL-PROVEN-PUBLISHED</html>",
      });
    },
  });

  assert.equal(result.status, "bundled_identity_restored");
  assert.equal(result.publishedRevisionId, localRevisionId);
  assert.notEqual(result.publishedRevisionId, danglingCloudId);
  assert.ok(
    seeded.storage
      .readDisplayRevision(seeded.project.id, seeded.display.id, localRevisionId)
      ?.html.includes("QUAIL-PROVEN-PUBLISHED"),
  );
  for (const mode of OUTPUT_MODES) {
    const served = bundleForMode(
      seeded.storage,
      seeded.project.id,
      seeded.display.id,
      localRevisionId,
      mode,
    );
    assert.ok(served?.html.includes("QUAIL-PROVEN-PUBLISHED"), mode);
    assert.doesNotMatch(served.html, /DRAFT-ONLY/);
  }
  await closeLocalDatabase(seeded.db);
  fs.rmSync(paths.root, { recursive: true, force: true });
});

test("already materialized published displays are not rewritten", async () => {
  const paths = createPaths("stable");
  const revisionId = crypto.randomUUID();
  const seeded = await seedBrokenDisplay(paths, {
    slug: "stream-ticker",
    name: "Stream Ticker",
    importKey: "broad-arrow:stream-ticker:v1",
    localRevisionId: revisionId,
    sourceHash: "published-hash",
    metadata: { cloudSynced: true },
  });
  const html = "<html><body>KEEP-LOCAL</body></html>";
  seeded.storage.writeDisplayRevision(seeded.project.id, seeded.display.id, revisionId, {
    html,
    css: "",
    javascript: "",
    metadata: { revisionId },
  });
  seeded.storage.writeDisplayPublished(seeded.project.id, seeded.display.id, {
    html,
    css: "",
    javascript: "",
    metadata: { revisionId },
  });
  const otherId = crypto.randomUUID();
  const result = await recoverFreshInstallPublishedRevision({
    projectId: seeded.project.id,
    displayId: seeded.display.id,
    slug: "stream-ticker",
    localPublishedRevisionId: revisionId,
    cloudPublishedRevisionId: otherId,
    knownCloudRevision: cloudRevision({
      id: otherId,
      displayId: seeded.display.id,
      projectId: seeded.project.id,
      html: "<html>OTHER</html>",
    }),
    fetchRevisionById: async () => null,
    revisions: seeded.revisions,
    displayCode: seeded.displayCode,
    storage: seeded.storage,
    actorUserId: "cloud-sync",
    pendingLocalActiveRevisionPush: false,
    localDisplaySyncPending: false,
  });
  assert.equal(result.status, "already_materialized");
  assert.equal(result.publishedRevisionId, revisionId);
  assert.match(
    seeded.storage.readDisplayPublished(seeded.project.id, seeded.display.id).html,
    /KEEP-LOCAL/,
  );
  await closeLocalDatabase(seeded.db);
  fs.rmSync(paths.root, { recursive: true, force: true });
});

test("project and display identity realignment moves published files", () => {
  const paths = createPaths("relocate");
  const storage = new ProjectCodeStorageService(paths);
  const oldProjectId = crypto.randomUUID();
  const newProjectId = crypto.randomUUID();
  const oldDisplayId = crypto.randomUUID();
  const newDisplayId = crypto.randomUUID();
  const revisionId = crypto.randomUUID();
  storage.writeDisplayRevision(oldProjectId, oldDisplayId, revisionId, {
    html: "<html>MOVED</html>",
    css: "",
    javascript: "",
    metadata: { revisionId },
  });
  storage.writeDisplayPublished(oldProjectId, oldDisplayId, {
    html: "<html>MOVED</html>",
    css: "",
    javascript: "",
    metadata: { revisionId },
  });

  assert.equal(storage.relocateProjectCodeRoot(oldProjectId, newProjectId), true);
  assert.equal(storage.relocateDisplayTree(newProjectId, oldDisplayId, newDisplayId), true);
  assert.match(storage.readDisplayRevision(newProjectId, newDisplayId, revisionId).html, /MOVED/);
  assert.match(storage.readDisplayPublished(newProjectId, newDisplayId).html, /MOVED/);
  assert.equal(storage.readDisplayRevision(oldProjectId, oldDisplayId, revisionId), null);
  fs.rmSync(paths.root, { recursive: true, force: true });
});
