#!/usr/bin/env node
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDisplayViewerLookupDiagnostic } from "../dist/lib/display-viewer-lookup-diagnostic.js";

test("local/cloud project mismatch resolves by slug fallback", () => {
  const diagnostic = buildDisplayViewerLookupDiagnostic({
    routeProjectSegment: "cloud-project-id",
    routeDisplaySlug: "stream-bid-display",
    previewMode: true,
    projects: {
      getById: (id) => (id === "cloud-project-id" ? null : null),
      getBySlug: () => null,
      list: () => [{ id: "local-project-id", slug: "broad-arrow-auctions" }],
    },
    displayCode: {
      getBySlug: (projectId, slug) =>
        projectId === "local-project-id" && slug === "stream-bid-display"
          ? {
              displayId: "display-1",
              projectId: "local-project-id",
              slug,
              publishedRevisionId: "rev-1",
              draftHtml: null,
            }
          : null,
    },
    displays: {
      getById: () => ({
        id: "display-1",
        projectId: "local-project-id",
        displayKey: "stream-bid-display",
      }),
    },
    displaySyncHooks: {},
    storage: {
      readDisplayPublished: () => null,
      readDisplayRevision: () => ({ html: "<html>preview</html>" }),
    },
  });

  assert.equal(diagnostic.slugFallbackProjectId, "local-project-id");
  assert.equal(diagnostic.stage, "ok");
  assert.equal(diagnostic.hasRevisionBundle, true);
});

test("missing published bundle is reported explicitly", () => {
  const diagnostic = buildDisplayViewerLookupDiagnostic({
    routeProjectSegment: "local-project-id",
    routeDisplaySlug: "stream-bid-display",
    previewMode: false,
    projects: {
      getById: (id) => ({ id, slug: "broad-arrow-auctions" }),
      getBySlug: (slug) => ({ id: "local-project-id", slug }),
      list: () => [{ id: "local-project-id", slug: "broad-arrow-auctions" }],
    },
    displayCode: {
      getBySlug: () => ({
        displayId: "display-1",
        projectId: "local-project-id",
        slug: "stream-bid-display",
        publishedRevisionId: null,
        draftHtml: null,
      }),
    },
    displays: {
      getById: () => ({
        id: "display-1",
        projectId: "local-project-id",
        displayKey: "stream-bid-display",
      }),
    },
    displaySyncHooks: {},
    storage: {
      readDisplayPublished: () => null,
      readDisplayRevision: () => null,
    },
  });

  assert.equal(diagnostic.stage, "published_content_missing");
});
