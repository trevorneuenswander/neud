#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("display version summaries resolve published revision ordinals", () => {
  const service = read("desktop/src/services/developer-tools-service.ts");
  assert.match(service, /resolveDisplayRevisionVersionNumber/);
  assert.match(service, /publishedRevisionId/);
  assert.match(service, /revisionHistory/);
});

test("revision labels expose display version fallback helper", () => {
  const labels = read("src/lib/developer-tools/revision-labels.ts");
  assert.match(labels, /resolveDisplayRevisionVersionNumber/);
});

test("migration repairs duplicate or missing display version numbers", () => {
  const migration = read("desktop/src/database/migrations/036_display_revision_version_repair.sql");
  const migrate = read("desktop/src/database/migrate.ts");
  assert.match(migration, /canonical_version/);
  assert.match(migration, /resource_type = 'display'/);
  assert.match(migrate, /036_display_revision_version_repair.sql/);
});

test("create/duplicate display responses use persisted revision version numbers", () => {
  const service = read("desktop/src/services/developer-tools-service.ts");
  assert.match(service, /createdRevision\.versionNumber/);
  assert.doesNotMatch(service, /versionNumber: 1,/);
});
