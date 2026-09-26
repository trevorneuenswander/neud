#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { readPublishedDisplayBundleForOutput } from "../dist/lib/reconcile-published-display-content.js";
import { ProjectCodeStorageService } from "../dist/services/project-code-storage-service.js";

const STREAM_DISPLAYS = [
  { slug: "stream-bid-display", html: "<html><body>bid</body></html>" },
  { slug: "stream-ticker", html: "<html><body>ticker</body></html>" },
  { slug: "led-display-quail", html: "<html><body>quail</body></html>" },
];

function createStoragePaths(name) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const root = path.join(process.cwd(), `.tmp-fresh-display-output-${name}-${suffix}`);
  const paths = {
    root,
    data: path.join(root, "data"),
    projects: path.join(root, "projects"),
    repoRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".."),
  };
  fs.mkdirSync(paths.projects, { recursive: true });
  return paths;
}

test("fresh cloud-synced Broad Arrow displays become output-ready without manual republish", () => {
  for (const spec of STREAM_DISPLAYS) {
    const paths = createStoragePaths(spec.slug);
    const storage = new ProjectCodeStorageService(paths);
    const projectId = crypto.randomUUID();
    const displayId = crypto.randomUUID();
    const revisionId = crypto.randomUUID();

    storage.writeDisplayRevision(projectId, displayId, revisionId, {
      html: spec.html,
      css: "",
      javascript: "",
      metadata: { revisionId },
    });

    assert.equal(storage.readDisplayPublished(projectId, displayId), null);

    const served = readPublishedDisplayBundleForOutput({
      projectId,
      displayId,
      publishedRevisionId: revisionId,
      storage,
    });

    assert.ok(served?.html.includes(spec.slug === "stream-bid-display" ? "bid" : spec.slug.includes("ticker") ? "ticker" : "quail"), spec.slug);
    assert.ok(storage.readDisplayPublished(projectId, displayId)?.html, spec.slug);

    fs.rmSync(paths.root, { recursive: true, force: true });
  }
});
